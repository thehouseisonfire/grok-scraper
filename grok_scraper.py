import argparse
import time
import re
import os
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import html2text


def clean_filename(title):
    """Sanitize the title for use as a filename."""
    return re.sub(r'[\\/*?:"+<>|]', "", title).strip().replace(" ", "_")[:100]


def extract_metadata(soup):
    """Extract metadata from the page head."""
    metadata = {}

    # Title
    og_title = soup.find("meta", property="og:title")
    if og_title:
        metadata["title"] = og_title.get("content", "").replace(
            " | Shared Grok Conversation", ""
        )
    else:
        metadata["title"] = (
            soup.title.string.replace(" | Shared Grok Conversation", "")
            if soup.title
            else "Grok_Conversation"
        )

    # Description (used for locating the first message)
    og_desc = soup.find("meta", property="og:description")
    if og_desc:
        metadata["description"] = og_desc.get("content", "")

    # URL
    og_url = soup.find("meta", property="og:url")
    if og_url:
        metadata["url"] = og_url.get("content", "")

    return metadata


def setup_markdown_converter():
    """Configure html2text for better Markdown output."""
    converter = html2text.HTML2Text()
    converter.ignore_links = False
    converter.ignore_images = False
    converter.ignore_tables = False
    converter.body_width = 0  # No wrapping
    converter.code_style = "fenced"
    converter.ul_item_mark = "-"
    return converter


def scrape_grok_conversation(url, output_file=None):
    """
    Scrapes a Grok shared conversation and saves it as Markdown.
    """
    print(f"[-] Launching browser for: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        try:
            # Increased timeout and use 'domcontentloaded' instead of 'networkidle'
            print("[-] Navigating to URL...")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                print(f"[!] Warning: initial navigation timed out or failed: {e}")

            # Wait for any of the common message containers to appear
            print("[-] Waiting for content to load...")
            selectors = [
                "main div.prose",
                "article",
                "div[id^='message-']",
                ".r-1p0dtai" # Common Grok obfuscated class
            ]
            
            content_found = False
            for selector in selectors:
                try:
                    page.wait_for_selector(selector, timeout=10000)
                    content_found = True
                    print(f"[-] Found content with selector: {selector}")
                    break
                except:
                    continue
            
            if not content_found:
                print("[!] Warning: No specific message selectors found. Waiting as fallback.")
                time.sleep(5)

            # Scroll down to ensure all content is rendered (Grok can be lazy)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)

            # Get content
            html_content = page.content()
            soup = BeautifulSoup(html_content, "html.parser")

            metadata = extract_metadata(soup)
            print(f"[-] Detected Title: {metadata.get('title')}")

            # --- Message Extraction Strategy ---
            # We look for blocks that represent a user/grok turn.
            # Usually these are siblings in a container.
            
            messages = []
            
            # Step 1: Find the main content area
            main = soup.find("main") or soup.find("article") or soup.body
            
            # Step 2: Look for elements that look like messages
            # Heuristic: Find all blocks that contain 'prose' content.
            # In Grok shared pages, each turn (User or Grok) is usually a child of a common container.
            
            # Find all prose containers
            prose_elements = main.select(".prose")
            if not prose_elements:
                # Try more generic selectors if .prose isn't used
                prose_elements = main.find_all(recursive=True, attrs={"class": lambda x: x and "message" in x.lower()})

            # Find the closest common parent for each prose element that represents the turn
            turns = []
            seen_turn_nodes = set()
            
            for pe in prose_elements:
                # Walk up to find a node that is a child of a large container
                curr = pe
                while curr and curr.parent and curr.parent.name != "body":
                    # If this node has siblings and is "high enough" in the tree, it might be a turn
                    parent = curr.parent
                    siblings = parent.find_all(recursive=False)
                    if len(siblings) > 1:
                        # If this parent seems to be the main list of messages
                        if curr not in seen_turn_nodes:
                            turns.append(curr)
                            seen_turn_nodes.add(curr)
                        break
                    curr = curr.parent

            print(f"[-] Identified {len(turns)} conversation turns.")

            # Process turns
            # The first message in a shared link is ALWAYS the user prompt that started it.
            # Then they alternate.
            
            current_role = "User"
            for turn in turns:
                text = turn.get_text(strip=True)
                if not text:
                    continue
                
                # Role check: If it contains "Grok" at the very beginning (common in some views)
                # or if it's strictly alternating.
                
                # Convert to MD
                converter = setup_markdown_converter()
                md_content = converter.handle(str(turn))
                
                # Clean UI noise
                lines = md_content.splitlines()
                cleaned = []
                is_code = False
                for L in lines:
                    if L.strip().startswith("```"):
                        is_code = not is_code
                    if not is_code:
                        if L.strip() in ["Copy", "Edit", "Regenerate", "Share", "Grok"]:
                            continue
                    cleaned.append(L)
                
                final_md = "\n".join(cleaned).strip()
                if not final_md:
                    continue

                messages.append({
                    "role": current_role,
                    "content": final_md
                })
                
                # Toggle role
                current_role = "Grok" if current_role == "User" else "User"

            if not messages:
                print("[!] No messages extracted. Dumping page source.")
                messages.append({
                    "role": "System",
                    "content": "No messages found. Full page text:\n\n" + main.get_text()
                })

            # Formatting Output
            if not output_file:
                output_file = f"{clean_filename(metadata.get('title', 'conversation'))}.md"

            with open(output_file, "w", encoding="utf-8") as f:
                f.write(f"# {metadata.get('title')}\n\n")
                if "url" in metadata:
                    f.write(f"**Source**: {metadata['url']}\n")
                f.write(f"**Date**: {time.strftime('%Y-%m-%d')}\n")
                f.write("---\n\n")

                for msg in messages:
                    f.write(f"## {msg['role']}\n\n")
                    f.write(msg["content"])
                    f.write("\n\n")

            print(f"[+] Successfully saved to {output_file}")

        except Exception as e:
            print(f"[!] Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape Grok shared conversations to Markdown.")
    parser.add_argument("url", help="The Grok share URL")
    parser.add_argument("-o", "--output", help="Output filename")

    args = parser.parse_args()
    scrape_grok_conversation(args.url, args.output)
