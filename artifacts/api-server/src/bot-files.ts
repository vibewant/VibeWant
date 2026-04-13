/**
 * Generates realistic language-specific files for bot-mirrored GitHub repos.
 */

export interface BotFile {
  path: string;
  content: string;
}

/* ── LICENSE (MIT) ────────────────────────────────────────────────── */
function license(): string {
  const year = new Date().getFullYear();
  return `MIT License

Copyright (c) ${year} Original Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

/* ── .gitignore per language ──────────────────────────────────────── */
function gitignore(lang: string): string {
  const os = `# OS
.DS_Store
Thumbs.db
*.swp
*~`;

  const byLang: Record<string, string> = {
    python: `# Python
__pycache__/
*.py[cod]
*.so
*.egg
*.egg-info/
dist/
build/
.eggs/
.env
.venv
venv/
env/
*.pyc
.pytest_cache/
.mypy_cache/
htmlcov/
.coverage
*.log
`,
    javascript: `# Node
node_modules/
dist/
.next/
.nuxt/
out/
build/
.env
.env.local
*.log
coverage/
`,
    typescript: `# Node / TypeScript
node_modules/
dist/
build/
.next/
.env
.env.local
*.log
coverage/
*.js.map
`,
    go: `# Go
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
`,
    rust: `# Rust
target/
Cargo.lock
**/*.rs.bk
`,
    java: `# Java
*.class
*.jar
*.war
*.ear
*.nar
target/
.classpath
.project
.settings/
build/
`,
    "c++": `# C/C++
*.o
*.d
*.out
*.a
*.so
build/
CMakeCache.txt
CMakeFiles/
Makefile
`,
    c: `# C
*.o
*.d
*.out
*.a
*.so
build/
Makefile
`,
    ruby: `# Ruby
*.gem
*.rbc
.bundle/
vendor/bundle/
log/
tmp/
`,
    php: `# PHP
vendor/
composer.lock
.env
*.log
`,
    shell: `# Shell
*.log
tmp/
`,
  };

  const specific = byLang[lang] ?? `# Build artifacts
dist/
build/
out/
*.log
`;
  return `${specific}\n${os}\n`;
}

/* ── Language-specific files ──────────────────────────────────────── */
function pythonFiles(name: string, description: string, _topics: string[]): BotFile[] {
  const pkgName = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

  return [
    {
      path: "setup.py",
      content: `from setuptools import setup, find_packages

setup(
    name="${pkgName}",
    version="0.1.0",
    description="${description.replace(/"/g, '\\"').slice(0, 100)}",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=open("requirements.txt").read().splitlines(),
)
`,
    },
    {
      path: "main.py",
      content: `#!/usr/bin/env python3
"""
${description.slice(0, 120)}
"""

import argparse
import logging
import sys


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="${description.slice(0, 80).replace(/"/g, '\\"')}")
    parser.add_argument("--config", type=str, default="config.yaml", help="Path to config file")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info("Starting ${name}...")
    logger.info("Config: %s", args.config)

    # TODO: implement main logic
    logger.info("Done.")


if __name__ == "__main__":
    main()
`,
    },
  ];
}

function jsFiles(name: string, description: string, isTs: boolean): BotFile[] {
  const ext = isTs ? "ts" : "js";
  const pkgName = name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();

  return [
    {
      path: "package.json",
      content: JSON.stringify({
        name: pkgName,
        version: "1.0.0",
        description: description.slice(0, 120),
        main: `index.${ext}`,
        scripts: {
          start: `node index.${ext}`,
          build: isTs ? "tsc" : undefined,
          test: "jest",
        },
        keywords: [],
        license: "MIT",
      }, null, 2) + "\n",
    },
    {
      path: `index.${ext}`,
      content: isTs
        ? `/**\n * ${description.slice(0, 100)}\n */\n\nexport function main(): void {\n  console.log("${name} initialized");\n}\n\nmain();\n`
        : `/**\n * ${description.slice(0, 100)}\n */\n\nfunction main() {\n  console.log("${name} initialized");\n}\n\nmain();\n`,
    },
  ];
}

function goFiles(name: string, description: string): BotFile[] {
  const modName = `github.com/example/${name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  return [
    {
      path: "go.mod",
      content: `module ${modName}\n\ngo 1.21\n`,
    },
    {
      path: "main.go",
      content: `// ${description.slice(0, 100)}
package main

import (
\t"flag"
\t"fmt"
\t"log"
\t"os"
)

func main() {
\tverbose := flag.Bool("verbose", false, "Enable verbose output")
\tflag.Parse()

\tlog.SetOutput(os.Stdout)
\tif *verbose {
\t\tlog.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
\t}

\tfmt.Println("${name}: starting...")
\t// TODO: implement main logic
\tfmt.Println("Done.")
}
`,
    },
  ];
}

function rustFiles(name: string, description: string): BotFile[] {
  const pkgName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return [
    {
      path: "Cargo.toml",
      content: `[package]
name = "${pkgName}"
version = "0.1.0"
edition = "2021"
description = "${description.slice(0, 100).replace(/"/g, '\\"')}"
license = "MIT"

[dependencies]
clap = { version = "4", features = ["derive"] }
anyhow = "1"
log = "0.4"
env_logger = "0.10"
`,
    },
    {
      path: "src/main.rs",
      content: `//! ${description.slice(0, 100)}

use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "${pkgName}", about = "${description.slice(0, 80).replace(/"/g, '\\"')}")]
struct Args {
    #[arg(short, long, default_value = "config.toml")]
    config: String,

    #[arg(short, long)]
    verbose: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();
    env_logger::init();

    println!("${name}: starting...");
    if args.verbose {
        println!("Config: {}", args.config);
    }

    // TODO: implement main logic
    println!("Done.");
    Ok(())
}
`,
    },
  ];
}

function javaFiles(name: string, description: string): BotFile[] {
  const className = name.replace(/[^a-zA-Z0-9]/g, "").replace(/^[0-9]+/, "") || "Main";
  return [
    {
      path: "pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>${name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}</artifactId>
    <version>1.0-SNAPSHOT</version>
    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
    </properties>
</project>
`,
    },
    {
      path: `src/main/java/${className}.java`,
      content: `/**
 * ${description.slice(0, 100)}
 */
public class ${className} {
    public static void main(String[] args) {
        System.out.println("${name}: starting...");
        // TODO: implement main logic
        System.out.println("Done.");
    }
}
`,
    },
  ];
}

function cppFiles(name: string, description: string): BotFile[] {
  return [
    {
      path: "CMakeLists.txt",
      content: `cmake_minimum_required(VERSION 3.16)
project(${name.replace(/[^a-zA-Z0-9_]/g, "_")} VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED True)

add_executable(main main.cpp)
`,
    },
    {
      path: "main.cpp",
      content: `/**
 * ${description.slice(0, 100)}
 */
#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
    std::cout << "${name}: starting..." << std::endl;
    // TODO: implement main logic
    std::cout << "Done." << std::endl;
    return 0;
}
`,
    },
    {
      path: "Makefile",
      content: `CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2

all: main

main: main.cpp
\t$(CXX) $(CXXFLAGS) -o main main.cpp

clean:
\trm -f main

.PHONY: all clean
`,
    },
  ];
}

function shellFiles(name: string, description: string): BotFile[] {
  return [
    {
      path: "install.sh",
      content: `#!/usr/bin/env bash
set -euo pipefail

# ${description.slice(0, 100)}

echo "Installing ${name}..."

# Check requirements
command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }

echo "Installation complete."
`,
    },
    {
      path: "run.sh",
      content: `#!/usr/bin/env bash
set -euo pipefail

# ${description.slice(0, 100)}

VERBOSE=false
CONFIG="config.yaml"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -v|--verbose) VERBOSE=true ;;
        -c|--config) CONFIG="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "Starting ${name}..."
[[ "$VERBOSE" == "true" ]] && echo "Config: $CONFIG"
# TODO: implement main logic
echo "Done."
`,
    },
  ];
}

/* ── Topic → dependency mapping ───────────────────────────────────── */
function topicsToDeps(topics: string[], lang: string): string[] {
  if (lang !== "python") return [];
  const map: Record<string, string[]> = {
    "machine-learning": ["scikit-learn>=1.3.0", "numpy>=1.24.0", "pandas>=2.0.0"],
    "deep-learning": ["torch>=2.0.0", "torchvision>=0.15.0", "numpy>=1.24.0"],
    "neural-network": ["torch>=2.0.0", "numpy>=1.24.0", "matplotlib>=3.7.0"],
    "nlp": ["transformers>=4.30.0", "tokenizers>=0.13.0", "datasets>=2.12.0"],
    "computer-vision": ["opencv-python>=4.7.0", "Pillow>=9.5.0", "numpy>=1.24.0"],
    "data-science": ["pandas>=2.0.0", "numpy>=1.24.0", "matplotlib>=3.7.0", "seaborn>=0.12.0"],
    "visualization": ["matplotlib>=3.7.0", "seaborn>=0.12.0", "plotly>=5.15.0"],
    "api": ["fastapi>=0.100.0", "uvicorn>=0.22.0", "pydantic>=2.0.0"],
    "cli": ["click>=8.1.0", "rich>=13.4.0"],
    "automation": ["requests>=2.31.0", "aiohttp>=3.8.0", "schedule>=1.2.0"],
    "llm": ["openai>=1.0.0", "anthropic>=0.20.0", "tiktoken>=0.5.0"],
    "rag": ["langchain>=0.1.0", "faiss-cpu>=1.7.4", "openai>=1.0.0"],
  };

  const deps = new Set<string>();
  for (const topic of topics) {
    const t = topic.toLowerCase();
    for (const [key, pkgs] of Object.entries(map)) {
      if (t.includes(key) || key.includes(t)) {
        pkgs.forEach(p => deps.add(p));
      }
    }
  }
  return [...deps];
}

/* ── Main export ──────────────────────────────────────────────────── */
export interface RepoMeta {
  name: string;
  description: string;
  language: string | null;
  topics: string[];
}

export function generateBotFiles(meta: RepoMeta, readmeContent: string): BotFile[] {
  const lang = (meta.language ?? "").toLowerCase();
  const { name, description, topics } = meta;
  const desc = description || `Repository: ${name}`;

  const files: BotFile[] = [
    { path: "README.md", content: readmeContent },
    { path: "LICENSE", content: license() },
    { path: ".gitignore", content: gitignore(lang) },
  ];

  if (lang === "python") {
    files.push(...pythonFiles(name, desc, topics));
  } else if (lang === "javascript") {
    files.push(...jsFiles(name, desc, false));
  } else if (lang === "typescript") {
    files.push(...jsFiles(name, desc, true));
  } else if (lang === "go") {
    files.push(...goFiles(name, desc));
  } else if (lang === "rust") {
    files.push(...rustFiles(name, desc));
  } else if (lang === "java") {
    files.push(...javaFiles(name, desc));
  } else if (lang === "c++" || lang === "c") {
    files.push(...cppFiles(name, desc));
  } else if (lang === "shell") {
    files.push(...shellFiles(name, desc));
  }

  return files;
}
