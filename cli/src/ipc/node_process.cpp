#include "node_process.hpp"

#include <array>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <reproc++/reproc.hpp>
#include <reproc++/run.hpp>

#if defined(NYLON_PLATFORM_WINDOWS)
#include <windows.h>
#endif

#include "cli/output.hpp"
#include "ipc/ndjson.hpp"

namespace pr::ipc {

namespace {

std::filesystem::path executable_directory() {
    namespace fs = std::filesystem;
#if defined(NYLON_PLATFORM_WINDOWS)
    char buffer[4096];
    DWORD len = GetModuleFileNameA(nullptr, buffer, sizeof(buffer));
    if (len == 0) return fs::current_path();
    return fs::path(std::string(buffer, len)).parent_path();
#else
    return fs::canonical("/proc/self/exe").parent_path();
#endif
}

} // namespace

std::string resolve_agent_path() {
    namespace fs = std::filesystem;

    if (const char* override_path = std::getenv("NYLON_AGENT_PATH")) {
        return override_path;
    }

    fs::path here = executable_directory();
    for (const auto& candidate : {
             here / "agent" / "dist" / "index.js",
             here / ".." / "agent" / "dist" / "index.js",
             here / ".." / ".." / "agent" / "dist" / "index.js",
         }) {
        if (fs::exists(candidate)) return fs::weakly_canonical(candidate).string();
    }
    throw std::runtime_error("Could not find agent/dist/index.js next to the binary. "
                             "Set NYLON_AGENT_PATH to its absolute path.");
}

std::string resolve_node_binary() {
    if (const char* override_path = std::getenv("NYLON_NODE")) {
        return override_path;
    }
    return "node";
}

struct NodeProcess::Impl {
    reproc::process process;
    std::mutex out_mutex;
    std::string stdout_buffer;
    std::string stderr_buffer;
    std::atomic<bool> exited{false};
};

NodeProcess::NodeProcess(std::string agent_js_path)
    : impl_(std::make_unique<Impl>()), agent_js_path_(std::move(agent_js_path)) {}

NodeProcess::~NodeProcess() {
    stop();
}

void NodeProcess::start() {
    if (started_) return;

    std::vector<std::string> argv = {resolve_node_binary(), agent_js_path_};
    reproc::options options;
    options.redirect.parent = false;
    options.stop = {
        {reproc::stop::terminate, reproc::milliseconds(500)},
        {reproc::stop::kill, reproc::milliseconds(500)},
    };

    if (auto ec = impl_->process.start(argv, options)) {
        throw std::runtime_error("Failed to spawn Node agent: " + ec.message());
    }
    started_ = true;
}

void NodeProcess::stop() {
    if (!started_) return;
    impl_->process.close(reproc::stream::in);
    int status = 0;
    impl_->process.wait(reproc::milliseconds(1000)).second;
    (void)status;
    started_ = false;
}

namespace {

bool read_until_line(reproc::process& proc, std::string& buffer, std::string& line) {
    line.clear();
    while (true) {
        const auto pos = buffer.find('\n');
        if (pos != std::string::npos) {
            line.assign(buffer, 0, pos);
            buffer.erase(0, pos + 1);
            if (!line.empty() && line.back() == '\r') line.pop_back();
            return true;
        }
        std::array<uint8_t, 4096> tmp{};
        auto [n, ec] = proc.read(reproc::stream::out, tmp.data(), tmp.size());
        if (ec) return false;
        if (n == 0) return false;
        buffer.append(reinterpret_cast<const char*>(tmp.data()), n);
    }
}

} // namespace

nlohmann::json NodeProcess::request(const nlohmann::json& payload) {
    if (!started_) start();

    const std::string line = serialise_line(payload);
    auto [_, ec] = impl_->process.write(reinterpret_cast<const uint8_t*>(line.data()), line.size());
    if (ec) throw std::runtime_error("Failed to write to agent: " + ec.message());

    std::string raw;
    if (!read_until_line(impl_->process, impl_->stdout_buffer, raw)) {
        throw std::runtime_error("Agent closed stdout before responding.");
    }
    return nlohmann::json::parse(raw);
}

std::vector<ProviderInfo> NodeProcess::list_providers() {
    const auto response = request({{"type", "listProviders"}});
    std::vector<ProviderInfo> result;
    if (response.value("type", "") != "providers") return result;
    for (const auto& p : response.value("providers", nlohmann::json::array())) {
        ProviderInfo info;
        info.id = p.value("id", "");
        info.display_name = p.value("displayName", info.id);
        for (const auto& m : p.value("models", nlohmann::json::array())) {
            info.models.push_back({m.value("id", ""), m.value("displayName", m.value("id", ""))});
        }
        result.push_back(std::move(info));
    }
    return result;
}

std::string NodeProcess::init() {
    const auto response = request({{"type", "init"}});
    if (response.value("type", "") == "result" && response.value("ok", false)) {
        return response.value("path", std::string{});
    }
    throw std::runtime_error(response.value("message", std::string{"Agent failed to init config."}));
}

ReviewResult NodeProcess::review(const ReviewRequest& req, pr::cli::Output& out) {
    nlohmann::json payload = {
        {"type", "review"},
        {"url", req.url},
        {"provider", req.provider},
        {"model", req.model},
        {"postReview", req.post_review},
    };

    const std::string line = serialise_line(payload);
    impl_->process.write(reinterpret_cast<const uint8_t*>(line.data()), line.size());

    ReviewResult result;
    std::string raw;
    while (read_until_line(impl_->process, impl_->stdout_buffer, raw)) {
        if (raw.empty()) continue;
        nlohmann::json event;
        try {
            event = nlohmann::json::parse(raw);
        } catch (const nlohmann::json::parse_error&) {
            out.debug("non-json line: " + raw);
            continue;
        }
        const std::string type = event.value("type", "");
        if (type == "progress") {
            out.on_progress(event);
        } else if (type == "log") {
            out.debug(event.value("message", ""));
        } else if (type == "result") {
            result.ok = event.value("ok", false);
            result.review_url = event.value("reviewUrl", "");
            result.summary = event.value("summary", "");
            result.message = event.value("message", "");
            return result;
        } else if (type == "error") {
            result.ok = false;
            result.message = event.value("message", "Agent error.");
            return result;
        }
    }

    result.ok = false;
    result.message = "Agent closed stdout without a result.";
    return result;
}

} // namespace pr::ipc
