#pragma once

#include <memory>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace pr::cli {
class Output;
}

namespace pr::ipc {

struct ModelInfo {
    std::string id;
    std::string display_name;
};

struct ProviderInfo {
    std::string id;
    std::string display_name;
    std::vector<ModelInfo> models;
};

struct ReviewRequest {
    std::string url;
    std::string provider;
    std::string model;
    bool post_review = true;
};

struct ReviewResult {
    bool ok = false;
    std::string review_url;
    std::string summary;
    std::string message;
};

class NodeProcess {
public:
    explicit NodeProcess(std::string agent_js_path);
    ~NodeProcess();

    NodeProcess(const NodeProcess&) = delete;
    NodeProcess& operator=(const NodeProcess&) = delete;

    void start();
    void stop();

    nlohmann::json request(const nlohmann::json& payload);

    std::vector<ProviderInfo> list_providers();
    std::string init();
    ReviewResult review(const ReviewRequest& req, pr::cli::Output& out);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
    std::string agent_js_path_;
    bool started_ = false;
};

std::string resolve_agent_path();
std::string resolve_node_binary();

} // namespace pr::ipc
