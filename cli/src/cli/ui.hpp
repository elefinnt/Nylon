#pragma once

#include <string>
#include <variant>

#include "args.hpp"
#include "config/config.hpp"
#include "ipc/node_process.hpp"

namespace pr::cli {

struct PickedProvider {
    std::string provider;
    std::string model;
};

struct PickError {
    std::string message;
};

class PickResult {
public:
    PickResult(PickedProvider v) : value_(std::move(v)) {}
    PickResult(PickError e) : value_(std::move(e)) {}

    explicit operator bool() const noexcept {
        return std::holds_alternative<PickedProvider>(value_);
    }
    const PickedProvider& operator*() const { return std::get<PickedProvider>(value_); }
    const PickedProvider* operator->() const { return &std::get<PickedProvider>(value_); }
    const PickError& error() const { return std::get<PickError>(value_); }

private:
    std::variant<PickedProvider, PickError> value_;
};

PickResult pick_provider_and_model(ipc::NodeProcess& agent,
                                   const Args& args,
                                   const config::Config& cfg);

void open_in_editor(const std::string& path);

} // namespace pr::cli
