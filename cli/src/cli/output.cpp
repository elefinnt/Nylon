#include "output.hpp"

#include <iostream>

namespace pr::cli {

namespace {

constexpr const char* kReset = "\x1b[0m";
constexpr const char* kBold = "\x1b[1m";
constexpr const char* kDim = "\x1b[2m";
constexpr const char* kGreen = "\x1b[32m";
constexpr const char* kRed = "\x1b[31m";
constexpr const char* kYellow = "\x1b[33m";
constexpr const char* kCyan = "\x1b[36m";

std::string label_for(const std::string& stage) {
    if (stage == "startup") return "Starting agent";
    if (stage == "loadingConfig") return "Loading config";
    if (stage == "fetching") return "Fetching PR";
    if (stage == "chunking") return "Splitting diff";
    if (stage == "reviewing") return "Running review";
    if (stage == "posting") return "Posting review";
    if (stage == "done") return "Done";
    return stage;
}

} // namespace

void Output::info(const std::string& message) {
    std::cout << kCyan << "info" << kReset << "  " << message << '\n';
}

void Output::success(const std::string& review_url) {
    std::cout << kGreen << kBold << "Posted review:" << kReset << ' ' << review_url << '\n';
}

void Output::error(const std::string& message) {
    std::cerr << kRed << kBold << "error" << kReset << " " << message << '\n';
}

void Output::debug(const std::string& message) {
    if (verbose_) {
        std::cerr << kDim << "debug " << message << kReset << '\n';
    }
}

void Output::on_progress(const nlohmann::json& event) {
    const std::string stage = event.value("stage", "");
    const std::string detail = event.value("detail", "");
    const auto tokens_in = event.contains("tokensIn") ? event["tokensIn"].get<long long>() : -1;
    const auto tokens_out = event.contains("tokensOut") ? event["tokensOut"].get<long long>() : -1;

    if (stage != current_stage_) {
        finish_stage();
        current_stage_ = stage;
        stage_started_ = std::chrono::steady_clock::now();
        std::cout << kBold << label_for(stage) << kReset;
        if (!detail.empty()) {
            std::cout << "  " << kDim << detail << kReset;
        }
        if (tokens_in >= 0 || tokens_out >= 0) {
            std::cout << "  " << kDim;
            if (tokens_in >= 0) std::cout << tokens_in << " in";
            if (tokens_out >= 0) std::cout << (tokens_in >= 0 ? " / " : "") << tokens_out << " out";
            std::cout << kReset;
        }
        std::cout << '\n';
        return;
    }

    if (verbose_) {
        if (!detail.empty() || tokens_out >= 0) {
            std::cout << "  " << kDim;
            if (!detail.empty()) std::cout << detail;
            if (tokens_out >= 0) std::cout << (detail.empty() ? "" : "  ") << tokens_out << " out";
            std::cout << kReset << '\n';
        }
    }
}

void Output::finish_stage() {
    current_stage_.clear();
    stage_started_.reset();
}

} // namespace pr::cli
