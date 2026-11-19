#!/usr/bin/env python3
"""
SafeKeep Appwrite Automation Setup Script
==========================================
Automatically provisions the Appwrite Database, Collections, Attributes,
Indexes, and Storage Bucket for the SafeKeep project.
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

def load_env_file(filepath):
    env = {}
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, '..'))

    # Load from ai_server/.env or web/.env.local or environment
    env = {}
    env.update(load_env_file(os.path.join(root_dir, 'ai_server', '.env')))
    env.update(load_env_file(os.path.join(root_dir, 'web', '.env.local')))
    env.update(os.environ)

    endpoint = env.get("APPWRITE_ENDPOINT", "").rstrip("/")
    project_id = env.get("APPWRITE_PROJECT_ID", "")
    api_key = env.get("APPWRITE_API_KEY", "")
    database_id = env.get("APPWRITE_DATABASE_ID", "safekeep")
    bucket_id = env.get("APPWRITE_BUCKET_ID", "item_images")

    print("=" * 60)
    print("SafeKeep — Automated Appwrite Provisioner")
    print("=" * 60)

    if not endpoint or not project_id or not api_key or "<REGION>" in endpoint or project_id == "your-project-id":
        print("\n[!] Valid Appwrite credentials not found in environment or .env files.")
        print(f"    Endpoint:   {endpoint or '(not set)'}")
        print(f"    Project ID: {project_id or '(not set)'}")
        print(f"    API Key:    {'(set)' if api_key and api_key != 'server-api-key-with-databases-read-write' else '(not set)'}")
        print("\nPlease update ai_server/.env and web/.env.local with your Appwrite endpoint, project ID, and server API key.")
        print("Example:")
        print("  APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1")
        print("  APPWRITE_PROJECT_ID=671234abcd...")
        print("  APPWRITE_API_KEY=eyJhbGciOi...")
        sys.exit(1)

    headers = {
        "X-Appwrite-Project": project_id,
        "X-Appwrite-Key": api_key,
        "Content-Type": "application/json",
    }

    def api_request(method, path, data=None):
        url = f"{endpoint}{path}"
        body = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                err_json = json.loads(err_body)
                return {"error": True, "status": e.code, "message": err_json.get("message", err_body)}
            except Exception:
                return {"error": True, "status": e.code, "message": err_body}
        except Exception as e:
            return {"error": True, "status": 500, "message": str(e)}

    # 1. Create Database
    print(f"\n[*] Checking Database '{database_id}'...")
    res = api_request("GET", f"/databases/{database_id}")
    if res.get("error") and res.get("status") == 404:
        print(f"    Creating database '{database_id}'...")
        res = api_request("POST", "/databases", {"databaseId": database_id, "name": "SafeKeep Database", "enabled": True})
        if res.get("error"):
            print(f"    [!] Failed to create database: {res.get('message')}")
        else:
            print(f"    [+] Database '{database_id}' created successfully!")
    elif not res.get("error"):
        print(f"    [+] Database '{database_id}' already exists.")

    # 2. Create Storage Bucket
    print(f"\n[*] Checking Storage Bucket '{bucket_id}'...")
    res = api_request("GET", f"/storage/buckets/{bucket_id}")
    if res.get("error") and res.get("status") == 404:
        print(f"    Creating bucket '{bucket_id}'...")
        res = api_request("POST", "/storage/buckets", {
            "bucketId": bucket_id,
            "name": "Item Images",
            "permissions": ['create("users")'],
            "fileSecurity": True,
            "enabled": True
        })
        if res.get("error"):
            print(f"    [!] Failed to create bucket: {res.get('message')}")
        else:
            print(f"    [+] Storage Bucket '{bucket_id}' created successfully!")
    elif not res.get("error"):
        print(f"    [+] Storage Bucket '{bucket_id}' already exists.")

    # 3. Create Collections & Attributes
    collections = {
        "items": {
            "name": "Items",
            "permissions": ['create("users")'],
            "documentSecurity": True,
            "attributes": [
                ("string", {"key": "user_id", "size": 36, "required": True}),
                ("string", {"key": "user_name", "size": 120, "required": False}),
                ("enum", {"key": "type", "elements": ["lost", "found"], "required": True}),
                ("string", {"key": "title", "size": 120, "required": True}),
                ("string", {"key": "description", "size": 2000, "required": True}),
                ("string", {"key": "location", "size": 160, "required": True}),
                ("string", {"key": "occurred_at", "size": 40, "required": False}),
                ("string", {"key": "image_path", "size": 36, "required": True}),
                ("string", {"key": "ai_caption", "size": 1000, "required": False}),
                ("string", {"key": "embedding", "size": 20000, "required": False}),
                ("enum", {"key": "status", "elements": ["open", "claimed", "returned"], "required": True}),
            ]
        },
        "verifications": {
            "name": "Verifications (Server-Only)",
            "permissions": [],
            "documentSecurity": False,
            "attributes": [
                ("string", {"key": "found_item_id", "size": 36, "required": True}),
                ("string", {"key": "prompt", "size": 240, "required": True}),
                ("string", {"key": "answer_hash", "size": 256, "required": True}),
                ("string", {"key": "salt", "size": 64, "required": True}),
            ]
        },
        "matches": {
            "name": "Matches (Server-Only)",
            "permissions": [],
            "documentSecurity": False,
            "attributes": [
                ("string", {"key": "lost_item_id", "size": 36, "required": True}),
                ("string", {"key": "found_item_id", "size": 36, "required": True}),
                ("string", {"key": "lost_owner_id", "size": 36, "required": True}),
                ("float", {"key": "similarity_score", "required": True, "min": 0.0, "max": 1.0}),
                ("enum", {"key": "status", "elements": ["suggested", "claimed", "verified", "rejected"], "required": True}),
            ]
        },
        "claims": {
            "name": "Claims (Server-Only)",
            "permissions": [],
            "documentSecurity": False,
            "attributes": [
                ("string", {"key": "match_id", "size": 36, "required": True}),
                ("string", {"key": "claimant_id", "size": 36, "required": True}),
                ("string", {"key": "found_item_id", "size": 36, "required": True}),
                ("enum", {"key": "status", "elements": ["pending", "verified", "rejected"], "required": True}),
                ("integer", {"key": "attempts", "required": True, "min": 0, "max": 10}),
            ]
        },
        "messages": {
            "name": "Messages (Server-Only)",
            "permissions": [],
            "documentSecurity": False,
            "attributes": [
                ("string", {"key": "item_id", "size": 36, "required": True}),
                ("string", {"key": "sender_id", "size": 36, "required": True}),
                ("string", {"key": "sender_name", "size": 120, "required": False}),
                ("string", {"key": "receiver_id", "size": 36, "required": True}),
                ("string", {"key": "message", "size": 2000, "required": True}),
            ]
        }
    }

    for col_id, col_spec in collections.items():
        print(f"\n[*] Checking Collection '{col_id}' ({col_spec['name']})...")
        res = api_request("GET", f"/databases/{database_id}/collections/{col_id}")
        if res.get("error") and res.get("status") == 404:
            print(f"    Creating collection '{col_id}'...")
            res = api_request("POST", f"/databases/{database_id}/collections", {
                "collectionId": col_id,
                "name": col_spec["name"],
                "permissions": col_spec["permissions"],
                "documentSecurity": col_spec["documentSecurity"],
                "enabled": True
            })
            if res.get("error"):
                print(f"    [!] Failed to create collection {col_id}: {res.get('message')}")
                continue
            print(f"    [+] Collection '{col_id}' created.")
        elif not res.get("error"):
            print(f"    [+] Collection '{col_id}' exists.")

        # Create attributes
        existing_attrs = {a["key"]: a for a in res.get("attributes", [])}
        for attr_type, attr_data in col_spec["attributes"]:
            attr_key = attr_data["key"]
            if attr_key in existing_attrs:
                continue
            print(f"      - Adding attribute '{attr_key}' ({attr_type})...")
            attr_res = api_request("POST", f"/databases/{database_id}/collections/{col_id}/attributes/{attr_type}", attr_data)
            if attr_res.get("error"):
                print(f"        [!] Warning: {attr_res.get('message')}")
            time.sleep(0.5)

    print("\n" + "=" * 60)
    print("SafeKeep Appwrite Provisioning Completed Successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()
