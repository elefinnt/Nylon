#pragma once

#include <functional>
#include <optional>
#include <string>

#include <nlohmann/json.hpp>

namespace pr::ipc {

class LineBuffer {
public:
    void feed(std::string_view chunk);
    std::optional<std::string> next_line();

private:
    std::string buffer_;
};

class JsonLineParser {
public:
    using Handler = std::function<void(nlohmann::json)>;

    explicit JsonLineParser(Handler handler) : handler_(std::move(handler)) {}

    void feed(std::string_view chunk);

private:
    LineBuffer lines_;
    Handler handler_;
};

std::string serialise_line(const nlohmann::json& value);

} // namespace pr::ipc
