#pragma once

#include <optional>
#include <stdexcept>
#include <string>

namespace pr::cli {

enum class Command {
    None,
    Review,
    Init,
    Providers,
    Version,
};

struct Args {
    Command command = Command::None;
    std::string pr_url;
    std::optional<std::string> provider;
    std::optional<std::string> model;
    bool verbose = false;
    bool dry_run = false;
};

class ArgsParseError : public std::runtime_error {
public:
    ArgsParseError(std::string message, int exit_code)
        : std::runtime_error(std::move(message)), exit_code_(exit_code) {}

    int exit_code() const noexcept { return exit_code_; }

private:
    int exit_code_;
};

Args parse_args(int argc, char** argv);

} // namespace pr::cli
