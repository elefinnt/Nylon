#include "args.hpp"

#include <cstdio>
#include <CLI/CLI.hpp>

namespace pr::cli {

Args parse_args(int argc, char** argv) {
    Args args;

    CLI::App app{"pr-review - post AI code reviews onto GitHub pull requests"};
    app.set_version_flag("--version,-V", std::string{PR_REVIEW_VERSION});
    app.require_subcommand(0, 1);

    app.add_flag("-v,--verbose", args.verbose, "Show debug logs from the agent on stderr");

    std::string url_value;
    std::string provider_value;
    std::string model_value;
    auto* url_opt = app.add_option("url", url_value, "GitHub pull request URL");
    auto* provider_opt = app.add_option("-p,--provider", provider_value,
                                        "AI provider id (e.g. anthropic, openai)");
    auto* model_opt = app.add_option("-m,--model", model_value,
                                     "Model id within the chosen provider");
    app.add_flag("--dry-run", args.dry_run,
                 "Run the review without posting it back to GitHub");

    auto* init = app.add_subcommand("init", "Create or open ~/.pr-agent/config.toml");
    auto* providers = app.add_subcommand("providers",
                                         "List providers and models known to the agent");

    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        throw ArgsParseError(e.what(), app.exit(e));
    }

    if (init->parsed()) {
        args.command = Command::Init;
        return args;
    }
    if (providers->parsed()) {
        args.command = Command::Providers;
        return args;
    }

    if (url_opt->count() > 0) {
        args.command = Command::Review;
        args.pr_url = url_value;
        if (provider_opt->count() > 0) args.provider = provider_value;
        if (model_opt->count() > 0) args.model = model_value;
        return args;
    }

    std::printf("%s\n", app.help().c_str());
    args.command = Command::None;
    return args;
}

} // namespace pr::cli
