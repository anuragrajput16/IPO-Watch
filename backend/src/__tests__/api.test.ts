import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { query } from "../db/pool.js";
import { call, makeIpo, makeUser, refreshCookie, startTestServer, stopTestServer } from "./helpers.js";

before(startTestServer);
after(stopTestServer);

describe("health", () => {
  it("responds without auth", async () => {
    const r = await call("/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });
});

describe("auth", () => {
  it("registers and returns a usable token", async () => {
    const r = await call("/api/auth/register", {
      method: "POST", body: { email: "a@test.com", password: "password123", name: "A" },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, "user");
    assert.ok(r.body.accessToken);
    assert.ok(refreshCookie(r.cookies), "sets a refresh cookie");
  });

  it("refuses a duplicate email", async () => {
    const r = await call("/api/auth/register", {
      method: "POST", body: { email: "a@test.com", password: "password123", name: "A" },
    });
    assert.equal(r.status, 409);
  });

  it("refuses a short password", async () => {
    const r = await call("/api/auth/register", {
      method: "POST", body: { email: "b@test.com", password: "short", name: "B" },
    });
    assert.equal(r.status, 422);
  });

  it("gives the same error for a wrong password and an unknown user", async () => {
    const wrongPw = await call("/api/auth/login", {
      method: "POST", body: { email: "a@test.com", password: "nope" },
    });
    const noUser = await call("/api/auth/login", {
      method: "POST", body: { email: "ghost@test.com", password: "nope" },
    });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    // Identical text, so the response can't be used to enumerate accounts.
    assert.equal(wrongPw.body.error, noUser.body.error);
  });

  it("rejects an unauthenticated request", async () => {
    assert.equal((await call("/api/ipos")).status, 401);
  });

  it("rejects a garbage token", async () => {
    assert.equal((await call("/api/ipos", { token: "not.a.jwt" })).status, 401);
  });
});

describe("refresh tokens", () => {
  it("rotates on use, and treats a replay as a breach", async () => {
    const user = await makeUser("rotate@test.com");
    const first = refreshCookie(user.cookies);

    const r1 = await call("/api/auth/refresh", { method: "POST", cookie: first });
    assert.equal(r1.status, 200);
    const second = refreshCookie(r1.cookies);
    assert.notEqual(first, second, "issues a different token");

    // Replaying the spent token means it leaked...
    const replay = await call("/api/auth/refresh", { method: "POST", cookie: first });
    assert.equal(replay.status, 401);

    // ...so the whole family dies, including the token that was still valid.
    const after = await call("/api/auth/refresh", { method: "POST", cookie: second });
    assert.equal(after.status, 401);
  });
});

describe("applicants and PAN handling", () => {
  it("validates PAN shape", async () => {
    const u = await makeUser("pan@test.com");
    const bad = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "X", pan: "NOTAPAN" },
    });
    assert.equal(bad.status, 422);
  });

  it("stores the PAN encrypted, not in plain text", async () => {
    const u = await makeUser("crypto@test.com");
    const r = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "Anurag", pan: "ABCDE1234F" },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.applicant.panLast4, "234F");
    assert.equal(r.body.applicant.pan, null, "not revealed by default");

    const rows = await query<{ pan_encrypted: string }>(
      `SELECT pan_encrypted FROM applicants WHERE id = $1`, [r.body.applicant.id]);
    assert.ok(!rows[0]!.pan_encrypted.includes("ABCDE1234F"), "ciphertext, not plaintext");

    const revealed = await call("/api/applicants?reveal=1", { token: u.token });
    assert.equal(revealed.body.applicants[0].pan, "ABCDE1234F", "round-trips on request");
  });

  it("refuses the same PAN twice for one user", async () => {
    const u = await makeUser("dupe@test.com");
    await call("/api/applicants", { method: "POST", token: u.token, body: { name: "A", pan: "ABCDE1234F" } });
    const second = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "B", pan: "ABCDE1234F" },
    });
    assert.equal(second.status, 409);
  });
});

describe("tenant isolation", () => {
  it("never shows one user another user's applicants", async () => {
    const alice = await makeUser("alice@test.com");
    const bob = await makeUser("bob@test.com");

    const created = await call("/api/applicants", {
      method: "POST", token: alice.token, body: { name: "Alice PAN", pan: "AAAAA1111A" },
    });
    const bobsList = await call("/api/applicants", { token: bob.token });
    assert.equal(bobsList.body.applicants.length, 0);

    // And can't reach it by id either.
    const steal = await call(`/api/applicants/${created.body.applicant.id}`, {
      method: "PATCH", token: bob.token, body: { name: "hacked" },
    });
    assert.equal(steal.status, 404);
  });

  it("refuses to attach someone else's applicant to an application", async () => {
    const alice = await makeUser("alice2@test.com");
    const bob = await makeUser("bob2@test.com");
    const ipo = await makeIpo("Test IPO A", "2026-12-01");
    const aliceApplicant = await call("/api/applicants", {
      method: "POST", token: alice.token, body: { name: "A", pan: "BBBBB2222B" },
    });
    const r = await call("/api/applications", {
      method: "POST", token: bob.token,
      body: { ipoId: ipo, applicantId: aliceApplicant.body.applicant.id, amount: 14000 },
    });
    assert.equal(r.status, 404);
  });
});

describe("admin authorization", () => {
  it("blocks a plain user from every admin route", async () => {
    const u = await makeUser("plain@test.com");
    for (const path of ["/api/admin/users", "/api/admin/stats", "/api/admin/ipos"]) {
      assert.equal((await call(path, { token: u.token })).status, 403, path);
    }
  });

  it("lets an admin through", async () => {
    const a = await makeUser("admin@test.com", "admin");
    assert.equal((await call("/api/admin/stats", { token: a.token })).status, 200);
  });

  it("stops an admin demoting themselves", async () => {
    const a = await makeUser("admin2@test.com", "admin");
    const r = await call(`/api/admin/users/${a.id}`, {
      method: "PATCH", token: a.token, body: { role: "user" },
    });
    assert.equal(r.status, 409);
  });

  it("refuses to delete an IPO that applications reference, unless forced", async () => {
    const a = await makeUser("admin3@test.com", "admin");
    const ipo = await makeIpo("Referenced IPO", "2026-12-01");
    const p = await call("/api/applicants", {
      method: "POST", token: a.token, body: { name: "P", pan: "CCCCC3333C" },
    });
    await call("/api/applications", {
      method: "POST", token: a.token,
      body: { ipoId: ipo, applicantId: p.body.applicant.id, amount: 14000 },
    });
    assert.equal((await call(`/api/admin/ipos/${ipo}`, { method: "DELETE", token: a.token })).status, 409);
    assert.equal((await call(`/api/admin/ipos/${ipo}?force=1`, { method: "DELETE", token: a.token })).status, 204);
  });
});

describe("applications and the allotment lookup", () => {
  it("reports each state correctly", async () => {
    const u = await makeUser("look@test.com");
    const closed = await makeIpo("Closed IPO", "2026-01-05");   // in the past
    const open = await makeIpo("Open IPO", "2099-01-01");       // far future
    const untouched = await makeIpo("Untouched IPO", "2099-01-01");

    const p = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "P", pan: "DDDDD4444D" },
    });
    const pid = p.body.applicant.id;

    const notApplied = await call(`/api/applications/lookup/${pid}/${untouched}`, { token: u.token });
    assert.equal(notApplied.body.state, "not_applied");

    await call("/api/applications", {
      method: "POST", token: u.token, body: { ipoId: open, applicantId: pid, amount: 14000 },
    });
    const stillOpen = await call(`/api/applications/lookup/${pid}/${open}`, { token: u.token });
    assert.equal(stillOpen.body.state, "not_out_yet");

    const app = await call("/api/applications", {
      method: "POST", token: u.token, body: { ipoId: closed, applicantId: pid, amount: 14000 },
    });
    const unchecked = await call(`/api/applications/lookup/${pid}/${closed}`, { token: u.token });
    assert.equal(unchecked.body.state, "unchecked");

    await call(`/api/applications/${app.body.application.id}`, {
      method: "PATCH", token: u.token, body: { allotment: "allotted" },
    });
    const allotted = await call(`/api/applications/lookup/${pid}/${closed}`, { token: u.token });
    assert.equal(allotted.body.state, "allotted");
  });

  it("rejects funder amounts that don't add up to the application", async () => {
    const u = await makeUser("split@test.com");
    const ipo = await makeIpo("Split IPO", "2099-01-01");
    const a = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "A", pan: "EEEEE5555E" },
    });
    const b = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "B", pan: "FFFFF6666F" },
    });
    const r = await call("/api/applications", {
      method: "POST", token: u.token,
      body: {
        ipoId: ipo, applicantId: a.body.applicant.id, amount: 10000,
        funders: [{ applicantId: b.body.applicant.id, amount: 3000 }],
      },
    });
    assert.equal(r.status, 422);
  });

  it("upserts rather than duplicating one PAN on one IPO", async () => {
    const u = await makeUser("upsert@test.com");
    const ipo = await makeIpo("Upsert IPO", "2099-01-01");
    const p = await call("/api/applicants", {
      method: "POST", token: u.token, body: { name: "P", pan: "GGGGG7777G" },
    });
    const body = { ipoId: ipo, applicantId: p.body.applicant.id, amount: 14000 };
    await call("/api/applications", { method: "POST", token: u.token, body });
    await call("/api/applications", { method: "POST", token: u.token, body: { ...body, amount: 15000 } });

    const list = await call("/api/applications", { token: u.token });
    assert.equal(list.body.applications.length, 1);
    assert.equal(list.body.applications[0].amount, 15000);
  });
});
