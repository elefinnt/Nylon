#include <cstdio>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <string>

#include "cli/args.hpp"
#include "cli/output.hpp"
#include "cli/ui.hpp"
#include "config/config.hpp"
#include "ipc/node_process.hpp"

namespace {

int run_review(const pr::cli::Args& args, pr::cli::Output& out);
int run_init(const pr::cli::Args& args, pr::cli::Output& out);
int run_providers(const pr::cli::Args& args, pr::cli::Output& out);

} // namespace

int main(int argc, char** argv) {
    try {
        pr::cli::Args args = pr::cli::parse_args(argc, argv);
        pr::cli::Output out{args.verbose};

        switch (args.command) {
            case pr::cli::Command::Review:
                return run_review(args, out);
            case pr::cli::Command::Init:
                return run_init(args, out);
            case pr::cli::Command::Providers:
                return run_providers(args, out);
            case pr::cli::Command::Version:
                std::cout << "nylon " << NYLON_VERSION << '\n';
                return 0;
            case pr::cli::Command::None:
                return 0;
        }
        return 0;
    } catch (const pr::cli::ArgsParseError& e) {
        // CLI11 has already printed help. Exit with its requested code.
        return e.exit_code();
    } catch (const std::exception& e) {
        std::cerr << "nylon: error: " << e.what() << '\n';
        return 1;
    } catch (...) {
        std::cerr << "nylon: unknown fatal error\n";
        return 1;
    }
}

namespace {

int run_review(const pr::cli::Args& args, pr::cli::Output& out) {
    auto cfg = pr::config::load_or_explain();
    if (!cfg) {
        out.error(cfg.error().message);
        return 2;
    }

    pr::ipc::NodeProcess agent{pr::ipc::resolve_agent_path()};
    agent.start();

    auto picked = pr::cli::pick_provider_and_model(agent, args, *cfg);
    if (!picked) {
        out.error(picked.error().message);
        return 2;
    }

    auto result = agent.review({
        .url = args.pr_url,
        .provider = picked->provider,
        .model = picked->model,
        .post_review = args.dry_run ? false : cfg->defaults.post_review,
    }, out);

    if (!result.ok) {
        out.error(result.message);
        return 1;
    }

    out.success(result.review_url);
    return 0;
}

int run_init(const pr::cli::Args& args, pr::cli::Output& out) {
    pr::ipc::NodeProcess agent{pr::ipc::resolve_agent_path()};
    agent.start();
    const auto path = agent.init();
    out.info("Wrote " + path);
    pr::cli::open_in_editor(path);
    return 0;
}

int run_providers(const pr::cli::Args& args, pr::cli::Output& out) {
    (void)args;
    pr::ipc::NodeProcess agent{pr::ipc::resolve_agent_path()};
    agent.start();
    const auto providers = agent.list_providers();
    for (const auto& p : providers) {
        out.info(p.id + "  -  " + p.display_name);
        for (const auto& m : p.models) {
            out.info("    " + m.id);
        }
    }
    return 0;
}

} // namespace
