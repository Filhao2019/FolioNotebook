// Read-only sharing, study groups and communities.
//
// Access to a notebook is one of: "owner" > "edit" > "view" (or none).
//  - Direct shares are always view-only.
//  - Group notebooks reach every member; the group's `editable` setting
//    decides whether members may edit them.
//  - Community notebooks are published by the community president and are
//    readable by every signed-in user on this server.
// Only the owner may delete a notebook or manage who it is shared with.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assert } from "./security.js";

const RANK = { view: 1, edit: 2, owner: 3 };
const idSchema = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const email = z
  .email()
  .max(254)
  .transform((x) => x.toLowerCase());

/** @typedef {"owner" | "edit" | "view"} Access */

/**
 * @param {any} db
 * @param {string} notebookId
 * @param {string} userId
 * @returns {Access | null}
 */
export function notebookAccess(db, notebookId, userId) {
  const notebook = db.get(
    "SELECT user_id FROM notebooks WHERE id=?",
    notebookId,
  );
  if (!notebook) return null;
  if (notebook.user_id === userId) return "owner";
  const viaGroup = db.get(
    "SELECT MAX(g.editable) AS editable FROM group_notebooks gn JOIN study_groups g ON g.id=gn.group_id JOIN group_members m ON m.group_id=g.id WHERE gn.notebook_id=? AND m.user_id=?",
    notebookId,
    userId,
  );
  if (viaGroup?.editable === 1) return "edit";
  if (viaGroup?.editable === 0) return "view";
  if (
    db.get(
      "SELECT 1 AS ok FROM notebook_shares WHERE notebook_id=? AND user_id=?",
      notebookId,
      userId,
    ) ||
    db.get(
      "SELECT 1 AS ok FROM community_notebooks WHERE notebook_id=?",
      notebookId,
    )
  )
    return "view";
  return null;
}

/** @param {Access | null} access @param {Access} need */
export const allows = (access, need) =>
  Boolean(access) && RANK[access] >= RANK[need];

/** Throw 404 when invisible, 403 when visible but not permitted. */
export function requireAccess(access, need) {
  assert(access, 404, "This item is unavailable.");
  assert(
    allows(access, need),
    403,
    need === "owner"
      ? "Only the notebook's owner can do this."
      : "This notebook is shared with you as view only.",
  );
}

/**
 * Routes for /api/shared, /api/groups, /api/communities, /api/following and
 * /api/notebooks/:id/shares. Returns `undefined` when the path is not ours.
 */
export function socialRoutes({ db, json, body, audit }) {
  /** Respond and report the request as handled. */
  const send = (res, data, status = 200) => {
    json(res, data, status);
    return true;
  };
  const account = (address) => {
    const row = db.get(
      "SELECT id,name FROM users WHERE email=? AND guest=0",
      address,
    );
    assert(row, 404, "No Folio account on this server uses that email.");
    return row;
  };
  const ownNotebook = (id, user) => {
    const row = db.get(
      "SELECT * FROM notebooks WHERE id=? AND user_id=?",
      idSchema.parse(id),
      user,
    );
    assert(row, 404, "You can only add notebooks you own.");
    return row;
  };
  const card = (n, user) => ({
    id: n.id,
    title: n.title,
    description: n.description,
    color: n.color,
    settings: JSON.parse(n.settings || "{}"),
    updated: n.updated,
    owner: n.owner,
    access: notebookAccess(db, n.id, user),
  });
  const membership = (groupId, user) => {
    const group = db.get(
      "SELECT g.* FROM study_groups g JOIN group_members m ON m.group_id=g.id WHERE g.id=? AND m.user_id=?",
      groupId,
      user,
    );
    assert(group, 404, "This group is unavailable.");
    return { group, owner: group.owner_id === user };
  };
  const community = (id) => {
    const row = db.get(
      "SELECT c.*,u.name AS president FROM communities c JOIN users u ON u.id=c.president_id WHERE c.id=?",
      id,
    );
    assert(row, 404, "This community is unavailable.");
    return row;
  };

  return async function handle(req, res, path, method, user, url) {
    // ---- Direct read-only shares ------------------------------------
    if (path[0] === "notebooks" && path[2] === "shares") {
      const access = notebookAccess(db, path[1], user);
      requireAccess(access, "owner");
      if (method === "GET" && path.length === 3)
        return send(
          res,
          db.all(
            "SELECT u.id AS userId,u.name,u.email,s.created FROM notebook_shares s JOIN users u ON u.id=s.user_id WHERE s.notebook_id=? ORDER BY s.created",
            path[1],
          ),
        );
      if (method === "POST" && path.length === 3) {
        const input = z.object({ email }).parse(await body(req));
        const target = account(input.email);
        assert(target.id !== user, 400, "You already own this notebook.");
        db.run(
          "INSERT OR IGNORE INTO notebook_shares(notebook_id,user_id) VALUES(?,?)",
          path[1],
          target.id,
        );
        audit(user, "notebook_shared", path[1]);
        return send(res, { userId: target.id, name: target.name }, 201);
      }
      if (method === "DELETE" && path.length === 4) {
        db.run(
          "DELETE FROM notebook_shares WHERE notebook_id=? AND user_id=?",
          path[1],
          path[3],
        );
        return send(res, { ok: true });
      }
    }
    if (path[0] === "shared" && method === "GET") {
      const rows = db.all(
        `SELECT DISTINCT n.*,u.name AS owner FROM notebooks n JOIN users u ON u.id=n.user_id
         WHERE n.user_id<>? AND (
           n.id IN (SELECT notebook_id FROM notebook_shares WHERE user_id=?)
           OR n.id IN (SELECT gn.notebook_id FROM group_notebooks gn JOIN group_members m ON m.group_id=gn.group_id WHERE m.user_id=?))
         ORDER BY n.updated DESC`,
        user,
        user,
        user,
      );
      return send(
        res,
        rows.map((n) => ({
          ...card(n, user),
          groups: db
            .all(
              "SELECT g.name FROM group_notebooks gn JOIN study_groups g ON g.id=gn.group_id JOIN group_members m ON m.group_id=g.id WHERE gn.notebook_id=? AND m.user_id=?",
              n.id,
              user,
            )
            .map((g) => g.name),
        })),
      );
    }

    // ---- Study groups -------------------------------------------------
    if (path[0] === "groups") {
      if (path.length === 1 && method === "GET")
        return send(
          res,
          db
            .all(
              `SELECT g.*,u.name AS ownerName,
                (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) AS memberCount,
                (SELECT COUNT(*) FROM group_notebooks WHERE group_id=g.id) AS notebookCount
               FROM study_groups g JOIN group_members m ON m.group_id=g.id JOIN users u ON u.id=g.owner_id
               WHERE m.user_id=? ORDER BY g.created`,
              user,
            )
            .map((g) => ({
              id: g.id,
              name: g.name,
              editable: Boolean(g.editable),
              owner: g.ownerName,
              role: g.owner_id === user ? "owner" : "member",
              memberCount: g.memberCount,
              notebookCount: g.notebookCount,
            })),
        );
      if (path.length === 1 && method === "POST") {
        const input = z
          .object({ name, editable: z.boolean().default(false) })
          .parse(await body(req));
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM study_groups WHERE owner_id=?",
            user,
          ).count < 50,
          400,
          "Group limit reached (50).",
        );
        const id = randomUUID();
        db.transaction(() => {
          db.run(
            "INSERT INTO study_groups(id,name,owner_id,editable) VALUES(?,?,?,?)",
            id,
            input.name,
            user,
            Number(input.editable),
          );
          db.run(
            "INSERT INTO group_members(group_id,user_id) VALUES(?,?)",
            id,
            user,
          );
        });
        audit(user, "group_created", id);
        return send(res, { id }, 201);
      }
      const { group, owner } = membership(path[1], user);
      if (path.length === 2 && method === "GET")
        return send(res, {
          group: {
            id: group.id,
            name: group.name,
            editable: Boolean(group.editable),
          },
          role: owner ? "owner" : "member",
          members: db.all(
            "SELECT u.id AS userId,u.name,u.email,CASE WHEN u.id=? THEN 'owner' ELSE 'member' END AS role FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.created",
            group.owner_id,
            group.id,
          ),
          notebooks: db
            .all(
              "SELECT n.*,u.name AS owner FROM group_notebooks gn JOIN notebooks n ON n.id=gn.notebook_id JOIN users u ON u.id=n.user_id WHERE gn.group_id=? ORDER BY gn.created DESC",
              group.id,
            )
            .map((n) => ({ ...card(n, user), mine: n.user_id === user })),
        });
      if (path.length === 2 && method === "PATCH") {
        assert(owner, 403, "Only the group's creator can change its settings.");
        const input = z
          .object({ name: name.optional(), editable: z.boolean().optional() })
          .parse(await body(req));
        db.run(
          "UPDATE study_groups SET name=?,editable=? WHERE id=?",
          input.name ?? group.name,
          input.editable === undefined
            ? group.editable
            : Number(input.editable),
          group.id,
        );
        return send(res, { ok: true });
      }
      if (path.length === 2 && method === "DELETE") {
        assert(owner, 403, "Only the group's creator can delete it.");
        db.run("DELETE FROM study_groups WHERE id=?", group.id);
        return send(res, { ok: true });
      }
      if (path[2] === "members" && method === "POST" && path.length === 3) {
        assert(owner, 403, "Only the group's creator can add members.");
        const target = account(
          z.object({ email }).parse(await body(req)).email,
        );
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM group_members WHERE group_id=?",
            group.id,
          ).count < 50,
          400,
          "Group member limit reached (50).",
        );
        db.run(
          "INSERT OR IGNORE INTO group_members(group_id,user_id) VALUES(?,?)",
          group.id,
          target.id,
        );
        audit(user, "group_member_added", group.id);
        return send(res, { userId: target.id, name: target.name }, 201);
      }
      if (path[2] === "members" && method === "DELETE" && path.length === 4) {
        const leaving = path[3];
        assert(
          owner || leaving === user,
          403,
          "Only the group's creator can remove other members.",
        );
        assert(
          leaving !== group.owner_id,
          400,
          "The creator cannot leave the group. Delete it instead.",
        );
        db.transaction(() => {
          db.run(
            "DELETE FROM group_members WHERE group_id=? AND user_id=?",
            group.id,
            leaving,
          );
          // A departing member's notebooks leave with them.
          db.run(
            "DELETE FROM group_notebooks WHERE group_id=? AND notebook_id IN (SELECT id FROM notebooks WHERE user_id=?)",
            group.id,
            leaving,
          );
        });
        return send(res, { ok: true });
      }
      if (path[2] === "notebooks" && method === "POST" && path.length === 3) {
        const input = z.object({ notebookId: idSchema }).parse(await body(req));
        const notebook = ownNotebook(input.notebookId, user);
        db.run(
          "INSERT OR IGNORE INTO group_notebooks(group_id,notebook_id) VALUES(?,?)",
          group.id,
          notebook.id,
        );
        audit(user, "group_notebook_added", group.id);
        return send(res, { ok: true }, 201);
      }
      if (path[2] === "notebooks" && method === "DELETE" && path.length === 4) {
        const notebook = db.get(
          "SELECT user_id FROM notebooks WHERE id=?",
          path[3],
        );
        assert(
          owner || notebook?.user_id === user,
          403,
          "Only the notebook's owner or the group's creator can remove it.",
        );
        db.run(
          "DELETE FROM group_notebooks WHERE group_id=? AND notebook_id=?",
          group.id,
          path[3],
        );
        return send(res, { ok: true });
      }
    }

    // ---- Communities --------------------------------------------------
    if (path[0] === "communities") {
      if (path.length === 1 && method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
        return send(
          res,
          db
            .all(
              `SELECT c.*,u.name AS president,
                (SELECT COUNT(*) FROM community_followers WHERE community_id=c.id) AS followers,
                (SELECT COUNT(*) FROM community_notebooks WHERE community_id=c.id) AS notebookCount,
                EXISTS(SELECT 1 FROM community_followers WHERE community_id=c.id AND user_id=?) AS following
               FROM communities c JOIN users u ON u.id=c.president_id
               WHERE (?='' OR c.name LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')
               ORDER BY following DESC, followers DESC, c.created DESC LIMIT 100`,
              user,
              q,
              `%${q.replace(/[\\%_]/g, "\\$&")}%`,
              `%${q.replace(/[\\%_]/g, "\\$&")}%`,
            )
            .map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              president: c.president,
              isPresident: c.president_id === user,
              followers: c.followers,
              notebookCount: c.notebookCount,
              following: Boolean(c.following),
            })),
        );
      }
      if (path.length === 1 && method === "POST") {
        const input = z
          .object({
            name,
            description: z.string().trim().max(1000).default(""),
          })
          .parse(await body(req));
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM communities WHERE president_id=?",
            user,
          ).count < 20,
          400,
          "Community limit reached (20).",
        );
        const id = randomUUID();
        db.run(
          "INSERT INTO communities(id,name,description,president_id) VALUES(?,?,?,?)",
          id,
          input.name,
          input.description,
          user,
        );
        audit(user, "community_created", id);
        return send(res, { id }, 201);
      }
      const c = community(path[1]);
      const president = c.president_id === user;
      if (path.length === 2 && method === "GET")
        return send(res, {
          community: {
            id: c.id,
            name: c.name,
            description: c.description,
            president: c.president,
          },
          isPresident: president,
          following: Boolean(
            db.get(
              "SELECT 1 AS ok FROM community_followers WHERE community_id=? AND user_id=?",
              c.id,
              user,
            ),
          ),
          followers: db.get(
            "SELECT COUNT(*) AS count FROM community_followers WHERE community_id=?",
            c.id,
          ).count,
          notebooks: db
            .all(
              `SELECT n.*,u.name AS owner,
                (SELECT COUNT(*) FROM community_reactions r WHERE r.community_id=cn.community_id AND r.notebook_id=n.id AND r.kind='like') AS likes,
                (SELECT COUNT(*) FROM community_reactions r WHERE r.community_id=cn.community_id AND r.notebook_id=n.id AND r.kind='follow') AS followers,
                EXISTS(SELECT 1 FROM community_reactions r WHERE r.community_id=cn.community_id AND r.notebook_id=n.id AND r.kind='like' AND r.user_id=?) AS liked,
                EXISTS(SELECT 1 FROM community_reactions r WHERE r.community_id=cn.community_id AND r.notebook_id=n.id AND r.kind='follow' AND r.user_id=?) AS followed
               FROM community_notebooks cn JOIN notebooks n ON n.id=cn.notebook_id JOIN users u ON u.id=n.user_id
               WHERE cn.community_id=? ORDER BY cn.created DESC`,
              user,
              user,
              c.id,
            )
            .map((n) => ({
              ...card(n, user),
              likes: n.likes,
              followers: n.followers,
              liked: Boolean(n.liked),
              followed: Boolean(n.followed),
            })),
        });
      if (path.length === 2 && method === "PATCH") {
        assert(president, 403, "Only the community's president can edit it.");
        const input = z
          .object({
            name: name.optional(),
            description: z.string().trim().max(1000).optional(),
          })
          .parse(await body(req));
        db.run(
          "UPDATE communities SET name=?,description=? WHERE id=?",
          input.name ?? c.name,
          input.description ?? c.description,
          c.id,
        );
        return send(res, { ok: true });
      }
      if (path.length === 2 && method === "DELETE") {
        assert(president, 403, "Only the community's president can delete it.");
        db.run("DELETE FROM communities WHERE id=?", c.id);
        return send(res, { ok: true });
      }
      if (path[2] === "follow" && path.length === 3) {
        assert(!president, 400, "You lead this community.");
        if (method === "POST")
          db.run(
            "INSERT OR IGNORE INTO community_followers(community_id,user_id) VALUES(?,?)",
            c.id,
            user,
          );
        else if (method === "DELETE")
          db.run(
            "DELETE FROM community_followers WHERE community_id=? AND user_id=?",
            c.id,
            user,
          );
        else return undefined;
        return send(res, { ok: true });
      }
      if (path[2] === "notebooks" && path.length === 3 && method === "POST") {
        assert(
          president,
          403,
          "Only the community's president can publish notebooks.",
        );
        const input = z.object({ notebookId: idSchema }).parse(await body(req));
        const notebook = ownNotebook(input.notebookId, user);
        db.run(
          "INSERT OR IGNORE INTO community_notebooks(community_id,notebook_id) VALUES(?,?)",
          c.id,
          notebook.id,
        );
        audit(user, "community_notebook_published", c.id);
        return send(res, { ok: true }, 201);
      }
      if (path[2] === "notebooks" && path[3]) {
        assert(
          db.get(
            "SELECT 1 AS ok FROM community_notebooks WHERE community_id=? AND notebook_id=?",
            c.id,
            path[3],
          ),
          404,
          "This notebook is not in the community.",
        );
        if (path.length === 4 && method === "DELETE") {
          assert(
            president,
            403,
            "Only the community's president can remove notebooks.",
          );
          db.run(
            "DELETE FROM community_notebooks WHERE community_id=? AND notebook_id=?",
            c.id,
            path[3],
          );
          return send(res, { ok: true });
        }
        if (path.length === 5 && ["like", "follow"].includes(path[4])) {
          if (method === "POST")
            db.run(
              "INSERT OR IGNORE INTO community_reactions(community_id,notebook_id,user_id,kind) VALUES(?,?,?,?)",
              c.id,
              path[3],
              user,
              path[4],
            );
          else if (method === "DELETE")
            db.run(
              "DELETE FROM community_reactions WHERE community_id=? AND notebook_id=? AND user_id=? AND kind=?",
              c.id,
              path[3],
              user,
              path[4],
            );
          else return undefined;
          return send(res, { ok: true });
        }
      }
    }
    if (path[0] === "following" && method === "GET")
      return send(
        res,
        db
          .all(
            `SELECT DISTINCT n.*,u.name AS owner,c.id AS communityId,c.name AS community
             FROM community_reactions r JOIN notebooks n ON n.id=r.notebook_id JOIN users u ON u.id=n.user_id JOIN communities c ON c.id=r.community_id
             WHERE r.user_id=? AND r.kind='follow' ORDER BY n.updated DESC`,
            user,
          )
          .map((n) => ({
            ...card(n, user),
            communityId: n.communityId,
            community: n.community,
          })),
      );
    return undefined;
  };
}
