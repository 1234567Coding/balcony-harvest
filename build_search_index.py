#!/usr/bin/env python3
"""Generate search-index.json for The Balcony Harvest (static site search).

Reads the 7 article pages, extracts title (h1, falling back to <title>),
URL ("articles/<slug>.html"), excerpt (first ~160 chars of the first
non-meta paragraph), and the list of h2 headings. Writes search-index.json
at the site root, then validates: JSON parses and every URL resolves to a
real local file.

Usage: python3 build_search_index.py   (run from the site root)
"""
import json
import os
import re
from html.parser import HTMLParser

SITE_ROOT = os.path.dirname(os.path.abspath(__file__))
ARTICLES_DIR = os.path.join(SITE_ROOT, "articles")
OUTPUT = os.path.join(SITE_ROOT, "search-index.json")

SLUGS = [
    "balcony-gardening-for-beginners",
    "best-grow-bags-for-vegetables",
    "easiest-herbs-for-beginners",
    "grow-tomatoes-in-pots",
    "growing-herbs-indoors-in-winter",
    "leggy-seedlings",
    "potting-mix-vs-garden-soil",
]

SKIP_P_CLASSES = {"article-meta", "affiliate-note", "breadcrumb"}


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title_tag = ""
        self.h1 = ""
        self.in_title = False
        self.in_h1 = False
        self.in_h2 = False
        self.current_h2 = ""
        self.headings = []
        self.in_p = False
        self.current_p = ""
        self.p_class = ""
        self.paragraphs = []  # list of (class, text)
        self.seen_h1 = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        elif tag == "h1":
            self.in_h1 = True
        elif tag == "h2":
            self.in_h2 = True
            self.current_h2 = ""
        elif tag == "p":
            self.in_p = True
            self.current_p = ""
            self.p_class = attrs.get("class", "")

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        elif tag == "h1":
            self.in_h1 = False
            self.seen_h1 = True
        elif tag == "h2":
            self.in_h2 = False
            text = re.sub(r"\s+", " ", self.current_h2).strip()
            if text:
                self.headings.append(text)
        elif tag == "p":
            if self.in_p:
                text = re.sub(r"\s+", " ", self.current_p).strip()
                if text:
                    self.paragraphs.append((self.p_class, text, self.seen_h1))
                self.in_p = False

    def handle_data(self, data):
        if self.in_title:
            self.title_tag += data
        if self.in_h1:
            self.h1 += data
        if self.in_h2:
            self.current_h2 += data
        if self.in_p:
            self.current_p += data


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


def build_index():
    entries = []
    for slug in SLUGS:
        path = os.path.join(ARTICLES_DIR, slug + ".html")
        with open(path, encoding="utf-8") as f:
            html = f.read()
        parser = ArticleParser()
        parser.feed(html)

        title = clean(parser.h1) or clean(parser.title_tag.split("|")[0])

        excerpt = ""
        for cls, text, after_h1 in parser.paragraphs:
            if not after_h1 or cls in SKIP_P_CLASSES:
                continue
            excerpt = clean(text)
            break
        if len(excerpt) > 160:
            cut = excerpt[:160].rsplit(" ", 1)[0]
            excerpt = (cut if len(cut) > 100 else excerpt[:160]).rstrip(",;:.") + "…"

        entries.append({
            "title": title,
            "url": "articles/%s.html" % slug,
            "excerpt": excerpt,
            "headings": parser.headings,
        })
    return entries


def validate(entries):
    for e in entries:
        assert e["title"], "missing title in %r" % e
        assert e["url"], "missing url in %r" % e
        local_path = os.path.join(SITE_ROOT, e["url"])
        assert os.path.isfile(local_path), "URL does not resolve to a file: %s" % e["url"]


def main():
    entries = build_index()
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # VALIDATE: parses + every URL resolves to a real local file
    with open(OUTPUT, encoding="utf-8") as f:
        parsed = json.load(f)
    validate(parsed)

    print("Wrote %s with %d entries; all %d URLs resolve to real files."
          % (OUTPUT, len(parsed), len(parsed)))
    for e in parsed:
        print("  - %s (%d headings)" % (e["url"], len(e["headings"])))


if __name__ == "__main__":
    main()
