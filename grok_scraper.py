import argparse
import time
import re
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
            page.goto(url)
            # Wait for hydration. Grok usually shows the title or content.
            # We wait for the network to settle.
            page.wait_for_load_state("networkidle")

            # Additional safety wait for React to render
            time.sleep(3)

            # Get content
            html_content = page.content()
            soup = BeautifulSoup(html_content, "html.parser")

            metadata = extract_metadata(soup)
            print(f"[-] Detected Title: {metadata.get('title')}")

            # --- Heuristic Extraction Strategy ---
            # 1. Use the description to find the first user message.
            search_text = metadata.get("description", "")[:50]  # First 50 chars

            messages = []

            # Fallback: If we can't find by description, we look for generic structure
            # We look for the main scrollable container. In many Next.js apps this is a main tag or a specific div.

            # Let's try to identify message blocks.
            # In Grok (and others), usually:
            # - User messages are in a container.
            # - Grok messages are in a container.
            # - They might have specific classes, but we want to be class-agnostic if possible.

            # Strategy: Find all elements that look like message bubbles.
            # We will assume that the conversation is a list of blocks.

            # Let's try to find the container by finding the text "Grok" which usually heads the bot response
            # Note: Grok sometimes uses an icon, but usually there's an aria-label or text.

            # More robust: Look for the specific message containers.
            # We will use Playwright to locate the element containing the description text
            try:
                # Find the element containing the start of the description
                if search_text:
                    first_msg_locator = page.get_by_text(search_text, exact=False).first
                    if first_msg_locator.count() > 0:
                        print("[-] Locate conversation via description text...")
                        # We want to find the repeated container parent.
                        # This is tricky blindly.
                        pass
            except Exception as e:
                print(f"[!] Warning: Could not locate via description: {e}")

            # General parsing of the current DOM state using BeautifulSoup
            # We look for a container that has multiple children with significant text.

            # Let's look for "User" and "Grok" headers if they exist as text
            # Often they are h2, h3, or strong tags.

            # ALTERNATIVE: Dump all text nodes and reconstruction.
            # BUT we need formatting (code blocks).

            # Let's try to capture the main article or main tag
            main_content = soup.find("main") or soup.find("article") or soup.body

            # Filter for message-like divs.
            # A message block usually contains:
            # 1. A header (Avatar/Name)
            # 2. The content

            extracted_blocks = []

            # Iterate recursively or linearly to find message groups
            # We'll rely on the visual separation usually implemented via distinct divs

            # Looking at the 'grok_dump.html' from earlier, the classes were obfuscated (r-1p0dtai etc).
            # This confirms we can't use classes.

            # We will assume a structure of:
            # [User Message Block] -> contains text matching description
            # [Grok Message Block]

            # Let's find the description node again in BS4
            if search_text:
                desc_node = main_content.find(
                    string=lambda text: text and search_text in text
                )
                if desc_node:
                    # Walk up until we hit a container that looks like a list item (e.g. has siblings of same type)
                    current = desc_node.parent
                    message_container = None

                    # We walk up 10 levels max
                    for _ in range(10):
                        if current.name == "body":
                            break
                        if current.parent:
                            siblings = list(
                                current.parent.find_all(current.name, recursive=False)
                            )
                            # If we have multiple siblings (messages), this is likely the conversation container
                            if len(siblings) > 1:
                                message_container = current.parent
                                break
                        current = current.parent

                    if message_container:
                        print("[-] Identified conversation container.")
                        children = message_container.find_all(recursive=False)

                        for child in children:
                            text = child.get_text()
                            if not text.strip():
                                continue

                            # Heuristic to detect role switch
                            # Does this child contain "Grok" or "User" explicitly?
                            # Often Grok displays "Grok" above the response.

                            # Check for "Grok" header
                            # This is fuzzy. We'll default to alternating if we found the first one is User.

                            # However, sometimes there are "Regenerate" buttons or other UI elements.
                            # We filter for substantial content.

                            # Check if it is a message
                            # Convert to MD
                            md = setup_markdown_converter().handle(str(child))

                            # Cleanup metadata/buttons from the text
                            # (e.g., "Copy", "Regenerate", "Edit")
                            md_lines = md.splitlines()
                            cleaned_lines = []
                            is_code_block = False
                            for line in md_lines:
                                if line.strip().startswith("```"):
                                    is_code_block = not is_code_block

                                # Filter common UI noise if not in code block
                                if not is_code_block:
                                    if line.strip() in [
                                        "Copy",
                                        "Edit",
                                        "Regenerate",
                                        "Share",
                                        "Grok",
                                    ]:
                                        continue

                                cleaned_lines.append(line)

                            clean_md = "\n".join(cleaned_lines).strip()

                            if not clean_md:
                                continue

                            # Detect Role
                            # If the block contains "Grok" at the start, it's Grok.
                            # If the previous was User, this is likely Grok.

                            # Let's try to find specific headers inside the HTML
                            # Often <div class="..." >Grok</div>

                            # Simple Alternating logic for now, seeded by the first message being User
                            # (since it matched the description)

                            extracted_blocks.append(
                                {
                                    "role": "Unknown",  # Will resolve later
                                    "content": clean_md,
                                    "html": str(child),
                                }
                            )

            # Post-processing roles
            # The first message matching description is DEFINITELY the User.
            # We assume alternating for now.
            if extracted_blocks:
                # Find the index of the block that matches description
                start_idx = 0
                for i, block in enumerate(extracted_blocks):
                    if search_text in block["content"] or search_text in block["html"]:
                        start_idx = i
                        block["role"] = "User"
                        break

                # Propagate roles
                # This is a naive assumption (alternating).
                # But for a shared link, it is usually strict turns.
                roles = ["User", "Grok"]
                current_role_idx = 0  # 0 for User

                for i in range(start_idx + 1, len(extracted_blocks)):
                    current_role_idx = 1 - current_role_idx
                    extracted_blocks[i]["role"] = roles[current_role_idx]

                # Backwards (if any)
                # ...

                messages = extracted_blocks[start_idx:]

            else:
                print("[!] Could not auto-detect conversation structure.")
                print("[!] Dumping full page text as fallback.")
                messages.append(
                    {
                        "role": "System",
                        "content": setup_markdown_converter().handle(str(main_content)),
                    }
                )

            # Formatting Output
            if not output_file:
                output_file = (
                    f"{clean_filename(metadata.get('title', 'conversation'))}.md"
                )

            with open(output_file, "w", encoding="utf-8") as f:
                # Header
                f.write(f"# {metadata.get('title')}\n\n")
                if "url" in metadata:
                    f.write(f"**Source**: {metadata['url']}\n")
                f.write(f"**Date**: {time.strftime('%Y-%m-%d')}")  # Approximate
                f.write("\n---\n\n")

                # Messages
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
    parser = argparse.ArgumentParser(
        description="Scrape Grok shared conversations to Markdown."
    )
    parser.add_argument(
        "url", help="The Grok share URL (e.g., https://grok.com/share/..."
    )
    parser.add_argument("-o", "--output", help="Output filename")

    args = parser.parse_args()
    scrape_grok_conversation(args.url, args.output)
