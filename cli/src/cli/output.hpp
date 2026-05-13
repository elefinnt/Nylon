#pragma once

#include <chrono>
#include <optional>
#include <string>

#include <nlohmann/json.hpp>

namespace pr::cli {

class Output {
public:
    explicit Output(bool verbose) : verbose_(verbose) {}

    void info(const std::string& message);
    void success(const std::string& review_url);
    void error(const std::string& message);
    void debug(const std::string& message);

    void on_progress(const nlohmann::json& event);
    void finish_stage();

    bool is_verbose() const noexcept { return verbose_; }

private:
    bool verbose_;
    std::string current_stage_;
    std::optional<std::chrono::steady_clock::time_point> stage_started_;
};

} // namespace pr::cli
