#include "ui.hpp"

#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

#include <ftxui/component/component.hpp>
#include <ftxui/component/screen_interactive.hpp>
#include <ftxui/dom/elements.hpp>

namespace pr::cli {

namespace {

int run_picker(const std::string& title, const std::vector<std::string>& entries) {
    using namespace ftxui;

    int selected = 0;
    auto screen = ScreenInteractive::TerminalOutput();

    auto menu = Menu(&entries, &selected);
    auto component = CatchEvent(menu, [&](Event ev) {
        if (ev == Event::Return) {
            screen.ExitLoopClosure()();
            return true;
        }
        if (ev == Event::Escape) {
            selected = -1;
            screen.ExitLoopClosure()();
            return true;
        }
        return false;
    });

    auto renderer = Renderer(component, [&] {
        return vbox({
                   text(title) | bold,
                   separator(),
                   component->Render() | frame,
                   separator(),
                   text("enter to choose, esc to cancel") | dim,
               }) |
               border;
    });

    screen.Loop(renderer);
    return selected;
}

std::optional<std::string> defaulted(const std::optional<std::string>& flag,
                                     const std::optional<std::string>& cfg) {
    if (flag) return flag;
    if (cfg) return cfg;
    return std::nullopt;
}

} // namespace

PickResult pick_provider_and_model(ipc::NodeProcess& agent,
                                   const Args& args,
                                   const config::Config& cfg) {
    const auto providers = agent.list_providers();
    if (providers.empty()) {
        return PickError{"No providers are available. Run `nylon init` first."};
    }

    auto provider_id = defaulted(args.provider, cfg.defaults.provider);
    auto model_id = defaulted(args.model, cfg.defaults.model);

    const ipc::ProviderInfo* provider = nullptr;
    if (provider_id) {
        for (const auto& p : providers) {
            if (p.id == *provider_id) {
                provider = &p;
                break;
            }
        }
        if (!provider) {
            return PickError{"Unknown provider id: " + *provider_id};
        }
    } else {
        std::vector<std::string> labels;
        labels.reserve(providers.size());
        for (const auto& p : providers) {
            labels.push_back(p.display_name + "  (" + p.id + ")");
        }
        const int idx = run_picker("Choose a provider", labels);
        if (idx < 0) return PickError{"Provider selection cancelled."};
        provider = &providers[static_cast<size_t>(idx)];
    }

    if (provider->models.empty()) {
        return PickError{"Provider has no configured models: " + provider->id};
    }

    std::string chosen_model;
    if (model_id) {
        for (const auto& m : provider->models) {
            if (m.id == *model_id) {
                chosen_model = m.id;
                break;
            }
        }
        if (chosen_model.empty()) {
            return PickError{"Unknown model id for " + provider->id + ": " + *model_id};
        }
    } else if (provider->models.size() == 1) {
        chosen_model = provider->models[0].id;
    } else {
        std::vector<std::string> labels;
        labels.reserve(provider->models.size());
        for (const auto& m : provider->models) labels.push_back(m.id);
        const int idx = run_picker("Choose a model for " + provider->display_name, labels);
        if (idx < 0) return PickError{"Model selection cancelled."};
        chosen_model = provider->models[static_cast<size_t>(idx)].id;
    }

    return PickedProvider{provider->id, chosen_model};
}

void open_in_editor(const std::string& path) {
#if defined(NYLON_PLATFORM_WINDOWS)
    std::string cmd = "notepad \"" + path + "\"";
#else
    const char* env_editor = std::getenv("EDITOR");
    const std::string editor = env_editor ? env_editor : "nano";
    std::string cmd = editor + " \"" + path + "\"";
#endif
    std::system(cmd.c_str());
}

} // namespace pr::cli
