import { upperFirst } from 'scule'
import type { ChangelogConfig } from './config'
import type { GitCommit } from './git'

export function generateMarkDown (commits: GitCommit[], config: ChangelogConfig) {
  const typeGroups = groupBy(commits, 'type')

  let markdown = ''

  for (const type in config.types) {
    const group = typeGroups[type]
    if (!group || !group.length) {
      continue
    }

    markdown += '\n\n' + '### ' + config.types[type].title + '\n\n'

    const scopeGroups = groupBy(group, 'scope')
    for (const scopeName in scopeGroups) {
      markdown += '\n#### ' + formatTitle(scopeName) + '\n\n'
      for (const commit of scopeGroups[scopeName].reverse()) {
        markdown += '  - ' +
        (commit.isBreaking ? '⚠️  ' : '') +
         (commit.references.join(', ') + ' ') +
         upperFirst(commit.description) +
          '\n'
      }
    }
  }

  let authors = commits.flatMap(commit => commit.authors.map(author => upperFirst(author.name)))
  authors = uniq(authors).sort()

  if (authors.length) {
    markdown += '\n\n' + '### ' + '❤️  Contributors' + '\n\n'
    markdown += authors.map(name => '- ' + name).join('\n')
  }

  markdown += '\n\n----\n\n'
  markdown += `Changes from **${config.from}...${config.to}**\n`
  if (config.github) {
    markdown += `\nSee all changes: https://github.com/${config.github}/compare/${config.from}...${config.to}\n`
  }

  return markdown.trim()
}

function formatTitle (title: string = '') {
  return title.length <= 3 ? title.toUpperCase() : upperFirst(title)
}

function groupBy (items: any[], key: string) {
  const groups = {}
  for (const item of items) {
    groups[item[key]] = groups[item[key]] || []
    groups[item[key]].push(item)
  }
  return groups
}

function uniq (items: any[]) {
  return Array.from(new Set(items))
}