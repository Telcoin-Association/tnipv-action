/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as tnipv from "tnipv-lint-js";
import core from "@actions/core";
import github from "@actions/github";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils.js";
import { throttling } from "@octokit/plugin-throttling";
import { ThrottlingOptions } from "@octokit/plugin-throttling/dist-types/types";
import { PullRequestEvent } from "@octokit/webhooks-types";
import * as toml from "smol-toml";
import * as fs from "node:fs/promises";
import * as path from "node:path";

function path2number(input: string): number {
  const name = path.parse(input).name;
  const start = name.indexOf("-") + 1;
  const rest = name.slice(start);
  const num = Number(rest);
  if (Number.isNaN(num)) {
    throw new Error(`file name "${name}" not in correct format`);
  }
  return num;
}

async function main() {
  try {
    const ThrottledOctokit = GitHub.plugin(throttling);

    const context = github.context;
    const githubToken = core.getInput("token");
    const pathPrefix = core.getInput("path") || "EIPS/";
    const throttle: ThrottlingOptions = {
      onRateLimit: (retryAfter, options: any) => {
        const method = options?.method || "<unknown>";
        const url = options?.url || "<unknown>";

        octokit.log.warn(
          `Request quota exhausted for request ${method} ${url}`
        );

        // Retry twice after hitting a rate limit error, then give up
        if (options?.request?.retryCount <= 2) {
          console.log(`Retrying after ${retryAfter} seconds...`);
          return true;
        }
      },
      onSecondaryRateLimit: (_retryAfter, options: any) => {
        const method = options?.method || "<unknown>";
        const url = options?.url || "<unknown>";

        // does not retry, only logs a warning
        octokit.log.warn(`Abuse detected for request ${method} ${url}`);
      },
    };
    const octokit = new ThrottledOctokit(
      getOctokitOptions(githubToken, { throttle })
    );

    switch (context.eventName) {
      case "pull_request":
      case "pull_request_target":
        break;
      default:
        core.warning(
          "tnipv-action should only be configured to run on pull requests"
        );
        return;
    }

    const uncheckedText = core.getInput("unchecked") || "";
    const unchecked = [];

    for (let item of uncheckedText.split(",")) {
      unchecked.push(Number(item.trim()));
    }

    const pull_event = context.payload as PullRequestEvent;
    const pull = pull_event.pull_request;

    const files = [];

    const fetched = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: pull.base.repo.owner.login,
      repo: pull.base.repo.name,
      pull_number: pull.number,
    });

    for (let entry of fetched) {
      const filename = entry.filename;
      const status = entry.status;

      if (status === "removed") {
        // Don't consider deleted files.
        continue;
      }

      if (!filename.startsWith(pathPrefix)) {
        // Only check files in the `EIPS/` directory.
        continue;
      }

      const number = path2number(filename);

      if (unchecked.some((i) => number === i)) {
        // Don't check certain files, as defined in the workflow.
        continue;
      }

      files.push(filename);
    }

    if (!files.length) {
      core.notice("no files to check");
      return;
    }

    interface Options {
      deny?: string[];
      warn?: string[];
      allow?: string[];
      default_lints?: unknown;
      default_modifiers?: unknown;
    }

    const levelConfig: Options = {
      deny: core
        .getInput("deny-checks")
        .split(",")
        .filter((e) => e),
      warn: core
        .getInput("warn-checks")
        .split(",")
        .filter((e) => e),
      allow: core
        .getInput("allow-checks")
        .split(",")
        .filter((e) => e),
    };

    const optionsFile = core.getInput("options-file");
    if (optionsFile) {
      const optionsText = await fs.readFile(optionsFile, {
        encoding: "utf8",
      });

      const optionsToml = toml.parse(optionsText);
      let changed = false;

      if ("lints" in optionsToml) {
        levelConfig.default_lints = optionsToml.lints;
        changed = true;
      }

      if ("modifiers" in optionsToml) {
        levelConfig.default_modifiers = optionsToml.modifiers;
        changed = true;
      }

      if (!changed) {
        throw new Error(
          "options-file must set at least one of `lints` or `modifiers`"
        );
      }
    }

    const result = await tnipv.lint(files, levelConfig);
    let hasErrors = false;

    for (let snippet of result) {
      let formatted;

      try {
        formatted = tnipv.format(snippet);
      } catch {
        // FIXME: This happens when there's an escape sequence in the JSON.
        //        serde_json can't deserialize it into an &str, so we display
        //        what we can.
        formatted = snippet.title?.label;
        if (!formatted) {
          formatted = "<failed to render diagnostic, this is a bug in tnipv>";
        }
      }

      let lineNumber = null;
      let file = null;

      if (snippet.slices?.length > 0) {
        lineNumber = snippet.slices[0].line_start;
        file = snippet.slices[0].origin;
      }

      const properties = {
        title: snippet.title?.label,
        startLine: lineNumber,
        file: file,
      };

      switch (snippet.title?.annotation_type) {
        case "Help":
        case "Note":
        case "Info":
          core.notice(formatted, properties);
          break;
        case "Warning":
          core.warning(formatted, properties);
          break;
        case "Error":
        default:
          core.error(formatted, properties);
          hasErrors = true;
          break;
      }
    }

    if (hasErrors) {
      core.setFailed("validation found errors :(");
    }
  } catch (error) {
    console.log(error);
    let msg = "failed";
    if (error instanceof Error) {
      msg = error.message;
    }
    core.setFailed(msg);
  }
}

main();
