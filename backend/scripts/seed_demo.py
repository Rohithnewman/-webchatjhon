"""Populate a running backend with a complete demo workspace.

Usage (backend must be running, worker too for document ingestion):
    .venv\\Scripts\\python.exe -m scripts.seed_demo
    .venv\\Scripts\\python.exe -m scripts.seed_demo --api http://127.0.0.1:8000/api/v1

Demo logins afterwards: see the account table in README.md.
"""

import argparse
import os
import sys
import time

import httpx

from scripts.demo_flows import DEMO_DOCUMENT, faq_knowledge, lead_capture, support_handoff

SUPERADMIN_EMAIL = "admin@admin.com"
SUPERADMIN_PASSWORD = "AdminPassword123!"

OWNER_EMAIL = "rohithnewman@gmail.com"
OWNER_PASSWORD = "Rogith@12345"
OWNER_NAME = "rogith"
OWNER_ORG = "Rogith"

AGENT_EMAIL = "agent@rogith.example"
AGENT_PASSWORD = "AgentPass123"
VIEWER_EMAIL = "viewer@rogith.example"
VIEWER_PASSWORD = "ViewerPass123"

NORTHWIND_EMAIL = "demo@northwind.example"
NORTHWIND_PASSWORD = "DemoPass123"


def main() -> int:
    import asyncio

    from scripts.create_superadmin import ensure as ensure_superadmin

    asyncio.run(ensure_superadmin(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, "Platform Admin"))

    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--owner-password", default=os.environ.get("SEED_OWNER_PASSWORD", OWNER_PASSWORD))
    args = parser.parse_args()
    api = args.api.rstrip("/")
    owner_password = args.owner_password
    client = httpx.Client(base_url=api, timeout=30)

    def session_for(email, password, name, org) -> dict:
        # Register, or log in if the account already exists.
        reg = client.post("/auth/register", json={"email": email, "password": password, "full_name": name, "org_name": org})
        if reg.status_code == 201:
            print("registered", email)
            return reg.json()["data"]
        login = client.post("/auth/login", json={"email": email, "password": password})
        if login.status_code >= 400:
            if email == OWNER_EMAIL:
                print(
                    f"Account {email} already exists with a different password. Either re-run with "
                    f"--owner-password <your password>, or align it with: python -m scripts.set_password "
                    f"--email {email} --password <new password>"
                )
            else:
                print(
                    f"Account {email} already exists with a different password. Align it with: "
                    f"python -m scripts.set_password --email {email} --password <new password>"
                )
            sys.exit(1)
        print("logged in as", email)
        return login.json()["data"]

    # 1. Account: the Rogith owner drives the rest of this script.
    tokens = session_for(OWNER_EMAIL, owner_password, OWNER_NAME, OWNER_ORG)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    def post(path, **kwargs):
        response = client.post(path, headers=headers, **kwargs)
        if response.status_code >= 400:
            print("FAILED", path, response.status_code, response.text)
            sys.exit(1)
        return response.json()["data"]

    # 2. A keyless provider so the AI node has somewhere to go if Ollama runs locally.
    existing = client.get("/provider-credentials", headers=headers).json()["data"]
    if not any(c["provider"] == "ollama" for c in existing):
        post("/provider-credentials", json={"provider": "ollama", "api_key": "", "label": "Local Ollama", "make_default": True})
        print("stored ollama credential")

    # 3. Team members: the agent for the handoff demo, the viewer for the read-only UI.
    members = client.get("/workspace/members", headers=headers).json()["data"]
    if not any(m["email"] == AGENT_EMAIL for m in members):
        post("/workspace/members", json={"email": AGENT_EMAIL, "full_name": "Agent Ana", "password": AGENT_PASSWORD, "role": "member"})
        print("added agent", AGENT_EMAIL)
    if not any(m["email"] == VIEWER_EMAIL for m in members):
        post("/workspace/members", json={"email": VIEWER_EMAIL, "full_name": "Viewer Vik", "password": VIEWER_PASSWORD, "role": "viewer"})
        print("added viewer", VIEWER_EMAIL)

    # 4. Knowledge base + FAQ document (ingested by the worker).
    bases = client.get("/knowledge-bases", headers=headers).json()["data"]
    base = next((b for b in bases if b["name"] == "Northwind FAQ"), None)
    if base is None:
        base = post("/knowledge-bases", json={"name": "Northwind FAQ", "description": "Shipping, returns, warranty"})
        print("created knowledge base", base["id"])
    docs = client.get(f"/knowledge-bases/{base['id']}/documents", headers=headers).json()["data"]
    if not docs:
        post(f"/knowledge-bases/{base['id']}/documents", files={"file": ("northwind-faq.txt", DEMO_DOCUMENT.encode("utf-8"), "text/plain")})
        print("uploaded FAQ document; waiting for the worker …")
        for _ in range(30):
            time.sleep(1)
            docs = client.get(f"/knowledge-bases/{base['id']}/documents", headers=headers).json()["data"]
            if docs and docs[0]["status"] == "ready":
                print("document ready,", docs[0]["chunk_count"], "chunks")
                break
        else:
            print("WARNING: document not ready — is `python -m app.worker` running?")

    # 5. Three published chatbots.
    bots = {b["name"]: b for b in client.get("/chatbots", headers=headers).json()["data"]}

    def ensure_bot(name, description, flow):
        bot = bots.get(name)
        if bot is None:
            bot = post("/chatbots", json={"name": name, "description": description})
            client.put(f"/chatbots/{bot['id']}/flow", headers=headers, json=flow).raise_for_status()
            client.patch(f"/chatbots/{bot['id']}", headers=headers, json={"status": "published"}).raise_for_status()
            print("created + published", name, bot["id"])
        return bot["id"]

    lead_id = ensure_bot("Lead Capture Bot", "Collects name, email and interest", lead_capture())
    faq_id = ensure_bot("FAQ Bot", "Answers from the Northwind FAQ knowledge base", faq_knowledge(base["id"]))
    support_id = ensure_bot("Support Bot", "Triage then hand off to a human", support_handoff())

    # 6. A few conversations so the inbox and analytics are not empty.
    def visitor(chatbot_id, *turns):
        started = client.post("/widget/conversations", json={"chatbot_id": chatbot_id})
        started.raise_for_status()
        data = started.json()["data"]
        widget_headers = {"Authorization": f"Bearer {data['token']}"}
        for text in turns:
            client.post(f"/widget/conversations/{data['conversation']['id']}/messages", headers=widget_headers, json={"content": text})

    existing_conversations = client.get("/conversations", headers=headers).json()["data"]
    if existing_conversations:
        print("conversations already present, skipping")
    else:
        visitor(lead_id, "Priya", "priya@example.com", "A demo")
        visitor(lead_id, "Sam", "sam@example.com", "Pricing")
        visitor(faq_id, "How long do refunds take?")
        visitor(support_id, "Billing")  # lands in handoff → waiting in the Inbox
        print("seeded 4 conversations")

    # 7. A second workspace, so the organisation owner has somewhere to switch to.
    organization = client.get("/organization", headers=headers).json()["data"]
    if not any(w["name"] == "Sales" for w in organization["workspaces"]):
        post("/organization/workspaces", json={"name": "Sales"})
        print("created workspace Sales")

    # 8. A second tenant, so the superadmin console lists more than one organisation.
    session_for(NORTHWIND_EMAIL, NORTHWIND_PASSWORD, "Demo Owner", "Northwind Outdoor")

    root = api.replace("/api/v1", "")
    print("\nDemo ready.")
    print(f"  Superadmin          : {SUPERADMIN_EMAIL} / {SUPERADMIN_PASSWORD}")
    print(f"  Organisation owner  : {OWNER_EMAIL} / {owner_password}  (org Rogith, workspaces Default + Sales)")
    print(f"  Agent (member)      : {AGENT_EMAIL} / {AGENT_PASSWORD}  (Rogith / Default)")
    print(f"  Viewer              : {VIEWER_EMAIL} / {VIEWER_PASSWORD}  (Rogith / Default)")
    print(f"  Second tenant owner : {NORTHWIND_EMAIL} / {NORTHWIND_PASSWORD}  (org Northwind Outdoor)")
    print(f"  Customer page       : {root}/demo?chatbot_id={support_id}")
    print(f"  FAQ bot page        : {root}/demo?chatbot_id={faq_id}")
    print(f"  Lead bot page       : {root}/demo?chatbot_id={lead_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
