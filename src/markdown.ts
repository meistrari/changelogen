import { upperFirst } from "scule";
import { convert } from "convert-gitmoji";
import { fetch } from "node-fetch-native";
import type { ResolvedChangelogConfig } from "./config";
import type { GitCommit, Reference } from "./git";
import { formatReference, formatCompareChanges } from "./repo";
import consola from "consola";

export async function generateMarkDown(
  commits: GitCommit[],
  config: ResolvedChangelogConfig
) {
  const typeGroups = groupBy(commits, "type");

  const markdown: string[] = [];
  const breakingChanges = [];

  // Generate Version Title
  const v = config.newVersion && `v${config.newVersion}`;
  const logger = consola.create({ stdout: process.stderr });
  logger.info(markdown)
  markdown.push("## What's Changed", " ");

  if (config.repo && config.from) {
    markdown.push("**Full Changelog**: " + formatCompareChanges(v, config));
  }

  // Process authors information
  const _authors = new Map<string, { email: Set<string>; github?: string }>();

  for (const commit of commits) {
    if (!commit.author) {
      continue;
    }
    const name = formatName(commit.author.name);
    if (!name || name.includes("[bot]")) {
      continue;
    }
    if (
      config.excludeAuthors &&
      config.excludeAuthors.some(
        (v) => name.includes(v) || commit.author.email?.includes(v)
      )
    ) {
      continue;
    }
    if (_authors.has(name)) {
      const entry = _authors.get(name);
      entry.email.add(commit.author.email);
    } else {
      _authors.set(name, { email: new Set([commit.author.email]) });
    }
  }

  // Try to map authors to github usernames
  await Promise.all(
    [..._authors.keys()].map(async (authorName) => {
      const meta = _authors.get(authorName);
      for (const email of meta.email) {
        const { user } = await fetch(`https://ungh.cc/users/find/${email}`)
          .then((r) => r.json())
          .catch(() => ({ user: null }));
        if (user) {
          meta.github = user.username;
          break;
        }
      }
    })
  );

  authors = [..._authors.entries()].map((e) => ({ name: e[0], ...e[1] }));

  // Generate general commits section
  for (const type in config.types) {
    const group = typeGroups[type];
    if (!group || group.length === 0) {
      continue;
    }

    markdown.push("", "### " + config.types[type].title, "");
    for (const commit of group.reverse()) {
      const line = await formatCommit(commit, config);
      markdown.push(line);
      if (commit.isBreaking) {
        breakingChanges.push(line);
      }
    }
  }

  // Generate breaking changes section
  if (breakingChanges.length > 0) {
    markdown.push("", "#### ⚠️ Breaking Changes", "", ...breakingChanges);
  }

  // Generate contributors section

  if (authors.length > 0) {
    markdown.push(
      "",
      "### " + "❤️ Contributors",
      "",
      ...authors.map((i) => {
        const _email = [...i.email].find(
          (e) => !e.includes("noreply.github.com")
        );
        const email = _email ? `<${_email}>` : "";
        const github = i.github
          ? `([@${i.github}](http://github.com/${i.github}))`
          : "";
        return `- ${i.name} ${github || email}`;
      })
    );
  }

  return convert(markdown.join("\n").trim(), true);
}

export function parseChangelogMarkdown(contents: string) {
  const headings = [...contents.matchAll(CHANGELOG_RELEASE_HEAD_RE)];
  const releases: { version?: string; body: string }[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];
    const [, title] = heading;
    const version = title.match(VERSION_RE);
    const release = {
      version: version ? version[1] : undefined,
      body: contents
        .slice(
          heading.index + heading[0].length,
          nextHeading?.index ?? contents.length
        )
        .trim(),
    };
    releases.push(release);
  }

  return {
    releases,
  };
}

// --- Internal utils ---
function findGithubUserByEmail(email: string): string | undefined {
  for (const [userName, userEntry] of authors.entries()) {
    if (userEntry.email.has(email)) {
        return userEntry.github || userName;
    }
  }
  return email;
}

function formatCommit(commit: GitCommit, config: ResolvedChangelogConfig) {
  const author = findGithubUserByEmail(commit.author.email);
  return (
    "- " +
    (commit.scope ? `**${commit.scope.trim()}:** ` : "") +
    (commit.isBreaking ? "⚠️  " : "") +
    upperFirst(commit.description) +
    " by " + formatGithubLink(author) +
    formatReferences(commit.references, config)
  );
}

function formatGithubLink(username: string) {
  return username.includes(" ") ? username : `[@${username}](https://github.com/${username})`;
}

function formatReferences(
  references: Reference[],
  config: ResolvedChangelogConfig
) {
  const pr = references.filter((ref) => ref.type === "pull-request");
  const issue = references.filter((ref) => ref.type === "issue");
  if (pr.length > 0 || issue.length > 0) {
    return (
      " (" +
      [...pr, ...issue]
        .map((ref) => formatReference(ref, config.repo))
        .join(", ") +
      ")"
    );
  }
  if (references.length > 0) {
    return " (" + formatReference(references[0], config.repo) + ")";
  }
  return "";
}

// function formatTitle (title: string = '') {
//   return title.length <= 3 ? title.toUpperCase() : upperFirst(title)
// }

function formatName(name = "") {
  return name
    .split(" ")
    .map((p) => upperFirst(p.trim()))
    .join(" ");
}

function groupBy(items: any[], key: string) {
  const groups = {};
  for (const item of items) {
    groups[item[key]] = groups[item[key]] || [];
    groups[item[key]].push(item);
  }
  return groups;
}

let authors;
const CHANGELOG_RELEASE_HEAD_RE = /^#{2,}\s+.*(v?(\d+\.\d+\.\d+)).*$/gm;
const VERSION_RE = /^v?(\d+\.\d+\.\d+)$/;