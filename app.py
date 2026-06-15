import os
import re
import html
import logging
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Simple in-memory cache
cache = {
    'data': None,
    'last_updated': None
}

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def get_hash(text):
    """Generate a stable unique MD5 hash for a release note item."""
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def clean_html_content(soup_elements):
    """Converts beautifulsoup elements to a clean string of HTML."""
    html_content = "".join(str(el) for el in soup_elements).strip()
    # Remove any empty paragraphs or whitespace issues
    html_content = re.sub(r'<p>\s*</p>', '', html_content)
    return html_content

def parse_release_notes_xml(xml_content):
    """
    Parses the Atom RSS feed for BigQuery Release Notes.
    Splits multi-item entries (where single entry has multiple h3 headers)
    into distinct release note items.
    """
    # Atom feed XML namespace
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    try:
        root = ET.fromstring(xml_content)
    except Exception as e:
        logger.error(f"Failed to parse XML string: {e}")
        return []

    entries = root.findall('atom:entry', ns)
    parsed_items = []
    
    for entry in entries:
        title_el = entry.find('atom:title', ns)
        entry_title = title_el.text.strip() if title_el is not None and title_el.text else ''
        
        id_el = entry.find('atom:id', ns)
        entry_id = id_el.text.strip() if id_el is not None and id_el.text else ''
        
        updated_el = entry.find('atom:updated', ns)
        updated_raw = updated_el.text.strip() if updated_el is not None and updated_el.text else ''
        
        # Try to parse the updated timestamp for sorting
        try:
            # e.g., "2026-06-12T00:00:00-07:00"
            # In python 3.7+, fromisoformat handles tz offsets like -07:00
            updated_dt = datetime.fromisoformat(updated_raw)
            formatted_date = updated_dt.strftime('%b %d, %Y')
            iso_date = updated_dt.date().isoformat()
        except Exception as e:
            logger.warning(f"Could not parse datetime {updated_raw}: {e}")
            formatted_date = entry_title or 'Unknown Date'
            iso_date = '2000-01-01'  # Fallback

        # Find alternate link
        link_el = entry.find("atom:link[@rel='alternate']", ns)
        if link_el is None:
            link_el = entry.find("atom:link", ns)
            
        base_link = 'https://cloud.google.com/bigquery/docs/release-notes'
        if link_el is not None:
            base_link = link_el.get('href', base_link)
        
        content_el = entry.find('atom:content', ns)
        if content_el is None or not content_el.text:
            continue
            
        content_html = content_el.text
        content_soup = BeautifulSoup(content_html, 'html.parser')
        
        # Find all h3 tags inside the content (which demarcate categories)
        h3_tags = content_soup.find_all('h3')
        
        if not h3_tags:
            # If no h3 categories exist, treat the whole content as a single 'General' item
            cleaned_body = clean_html_content(content_soup.contents)
            item_key = f"{entry_id}_General_{cleaned_body[:50]}"
            parsed_items.append({
                'id': get_hash(item_key),
                'date_str': formatted_date,
                'iso_date': iso_date,
                'category': 'General',
                'content': cleaned_body,
                'link': base_link,
                'raw_entry_id': entry_id
            })
            continue

        # Split content by h3 elements
        for i, h3 in enumerate(h3_tags):
            category = h3.get_text().strip()
            
            # Gather all sibling tags after this h3 until the next h3
            content_elements = []
            sibling = h3.next_sibling
            while sibling and sibling.name != 'h3':
                content_elements.append(sibling)
                sibling = sibling.next_sibling
                
            cleaned_body = clean_html_content(content_elements)
            
            # Skip empty entries
            if not cleaned_body:
                continue
                
            item_key = f"{entry_id}_{category}_{i}_{cleaned_body[:100]}"
            item_id = get_hash(item_key)
            
            parsed_items.append({
                'id': item_id,
                'date_str': formatted_date,
                'iso_date': iso_date,
                'category': category,
                'content': cleaned_body,
                'link': base_link,
                'raw_entry_id': entry_id
            })
            
    # Sort items chronologically descending (latest first)
    parsed_items.sort(key=lambda x: (x['iso_date'], x['id']), reverse=True)
    return parsed_items

def fetch_feed_data(force=False):
    """Fetch feed from Google docs with simple caching."""
    global cache
    
    if not force and cache['data'] is not None:
        # Simple cache validation (e.g. check if fetched in the last 15 minutes)
        # For this exercise, simple in-memory cache is fine unless forced
        logger.info("Serving release notes from cache")
        return cache['data'], cache['last_updated']
        
    logger.info(f"Fetching BigQuery release notes from {FEED_URL}")
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        
        parsed_data = parse_release_notes_xml(response.content)
        
        cache['data'] = parsed_data
        cache['last_updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        return cache['data'], cache['last_updated']
    except Exception as e:
        logger.error(f"Error fetching/parsing feed: {e}")
        # If fetch fails but we have cached data, fall back to cache
        if cache['data'] is not None:
            logger.info("Fetch failed. Serving stale data from cache.")
            return cache['data'], cache['last_updated']
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes', methods=['GET'])
def get_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        data, last_updated = fetch_feed_data(force=force_refresh)
        return jsonify({
            'success': True,
            'notes': data,
            'last_updated': last_updated,
            'count': len(data)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Default to port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
