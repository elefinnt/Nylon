#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <variant>

namespace pr::config {

struct ProviderEntry {
    std::optional<std::string> api_key;
    std::optional<std::string> default_model;
    std::optional<std::string> base_url;
};

struct Defaults {
    std::optional<std::string> provider;
    std::optional<std::string> model;
    bool post_review = true;
};

struct Config {
    std::string github_token;
    std::unordered_map<std::string, ProviderEntry> providers;
    Defaults defaults;
    std::string source_path;
};

struct LoadError {
    std::string message;
};

class LoadResult {
public:
    LoadResult(Config c) : value_(std::move(c)) {}
    LoadResult(LoadError e) : value_(std::move(e)) {}

    explicit operator bool() const noexcept { return std::holds_alternative<Config>(value_); }
    Config& operator*() { return std::get<Config>(value_); }
    const Config& operator*() const { return std::get<Config>(value_); }
    Config* operator->() { return &std::get<Config>(value_); }
    const Config* operator->() const { return &std::get<Config>(value_); }
    const LoadError& error() const { return std::get<LoadError>(value_); }

private:
    std::variant<Config, LoadError> value_;
};

std::string default_config_path();

LoadResult load_or_explain();
LoadResult load_from(const std::string& path);

} // namespace pr::config
