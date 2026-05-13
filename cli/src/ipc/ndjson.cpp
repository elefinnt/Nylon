#include "ndjson.hpp"

namespace pr::ipc {

void LineBuffer::feed(std::string_view chunk) {
    buffer_.append(chunk.data(), chunk.size());
}

std::optional<std::string> LineBuffer::next_line() {
    const auto pos = buffer_.find('\n');
    if (pos == std::string::npos) return std::nullopt;
    std::string line = buffer_.substr(0, pos);
    buffer_.erase(0, pos + 1);
    if (!line.empty() && line.back() == '\r') {
        line.pop_back();
    }
    return line;
}

void JsonLineParser::feed(std::string_view chunk) {
    lines_.feed(chunk);
    while (auto line = lines_.next_line()) {
        if (line->empty()) continue;
        try {
            handler_(nlohmann::json::parse(*line));
        } catch (const nlohmann::json::parse_error&) {
            // Malformed lines surface as a synthetic error event so the caller can decide.
            handler_(nlohmann::json{{"type", "error"},
                                    {"code", "BAD_JSON"},
                                    {"message", "Agent emitted non-JSON line"},
                                    {"raw", *line}});
        }
    }
}

std::string serialise_line(const nlohmann::json& value) {
    std::string s = value.dump();
    s.push_back('\n');
    return s;
}

} // namespace pr::ipc
