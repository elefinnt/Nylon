#include "config.hpp"

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#include <toml++/toml.hpp>

namespace pr::config {

namespace {

std::string home_directory() {
#if defined(PR_REVIEW_PLATFORM_WINDOWS)
    if (const char* home = std::getenv("USERPROFILE")) return home;
    if (const char* drive = std::getenv("HOMEDRIVE")) {
        if (const char* path = std::getenv("HOMEPATH")) {
            return std::string{drive} + path;
        }
    }
    return ".";
#else
    if (const char* home = std::getenv("HOME")) return home;
    return ".";
#endif
}

std::optional<std::string> opt_string(const toml::node_view<const toml::node>& node) {
    if (!node) return std::nullopt;
    if (auto str = node.value<std::string>()) return *str;
    return std::nullopt;
}

} // namespace

std::string default_config_path() {
    namespace fs = std::filesystem;
    fs::path p = home_directory();
    p /= ".pr-agent";
    p /= "config.toml";
    return p.string();
}

LoadResult load_or_explain() {
    return load_from(default_config_path());
}

LoadResult load_from(const std::string& path) {
    namespace fs = std::filesystem;

    if (!fs::exists(path)) {
        std::ostringstream msg;
        msg << "Config file not found at " << path << ".\n"
            << "Run `pr-review init` to create it.";
        return LoadError{msg.str()};
    }

    toml::table root;
    try {
        root = toml::parse_file(path);
    } catch (const toml::parse_error& e) {
        std::ostringstream msg;
        msg << "Could not parse " << path << ":\n  " << e.description();
        return LoadError{msg.str()};
    }

    Config cfg;
    cfg.source_path = path;

    auto github = root["github"];
    if (auto token = github["token"].value<std::string>()) {
        cfg.github_token = *token;
    } else {
        return LoadError{"Missing [github].token in " + path + ". Generate a Personal Access Token at https://github.com/settings/tokens"};
    }
    if (cfg.github_token.empty() || cfg.github_token.find("replace_me") != std::string::npos) {
        return LoadError{"github.token in " + path + " is empty or still a placeholder."};
    }

    if (auto providers = root["providers"].as_table()) {
        for (const auto& [key, val] : *providers) {
            if (auto tbl = val.as_table()) {
                ProviderEntry entry;
                if (auto k = (*tbl)["api_key"].value<std::string>()) entry.api_key = *k;
                if (auto m = (*tbl)["default_model"].value<std::string>()) entry.default_model = *m;
                if (auto b = (*tbl)["base_url"].value<std::string>()) entry.base_url = *b;
                cfg.providers.emplace(std::string{key.str()}, std::move(entry));
            }
        }
    }

    auto defaults = root["defaults"];
    if (auto p = defaults["provider"].value<std::string>()) cfg.defaults.provider = *p;
    if (auto m = defaults["model"].value<std::string>()) cfg.defaults.model = *m;
    if (auto post = defaults["post_review"].value<bool>()) cfg.defaults.post_review = *post;

    return cfg;
}

} // namespace pr::config
