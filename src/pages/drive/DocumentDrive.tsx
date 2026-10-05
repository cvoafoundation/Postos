import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import { PageHeader } from "@/components/layout/AppShell";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { Modal } from "@/components/ui/Modal";
import {
  EMPTY_DOCUMENT,
  driveBlobPath,
  fileSize,
  type DriveItem,
  type DriveShare,
  type DriveWorkspace,
} from "@/lib/drive";
import { FileText, Folder, Star, Upload } from "lucide-react";
const DocumentEditor = lazy(() => import("./DocumentEditor"));
type View = "files" | "shared" | "recent" | "starred" | "templates" | "trash";
export default function DocumentDrive() {
  const { profile, isNational } = useAuth();
  const [queryParams] = useSearchParams(),
    linkedItem = queryParams.get("item"),
    linkedPost = queryParams.get("post");
  const openedLink = useRef("");
  const [workspaces, setWorkspaces] = useState<DriveWorkspace[]>([]),
    [recipients, setRecipients] = useState<
      { id: string; name: string; kind: string }[]
    >([]);
  const [workspace, setWorkspace] = useState(""),
    [parent, setParent] = useState<DriveItem | null>(null),
    [trail, setTrail] = useState<DriveItem[]>([]),
    [view, setView] = useState<View>("files");
  const [items, setItems] = useState<DriveItem[]>([]),
    [favorites, setFavorites] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const [parentLevel, setParentLevel] = useState(0);
  const [search, setSearch] = useState(""),
    [editorItem, setEditorItem] = useState<DriveItem | null>(null),
    [editorLevel, setEditorLevel] = useState(0);
  const [selected, setSelected] = useState<DriveItem | null>(null),
    [url, setUrl] = useState<string | null>(null),
    [shares, setShares] = useState<DriveShare[]>([]),
    [history, setHistory] = useState<any[]>([]);
  const [recipient, setRecipient] = useState(""),
    [permission, setPermission] = useState("view"),
    [expires, setExpires] = useState(""),
    [moveTarget, setMoveTarget] = useState(""),
    [folders, setFolders] = useState<DriveItem[]>([]),
    [selectedLevel, setSelectedLevel] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null),
    replaceRef = useRef<HTMLInputElement>(null);
  const workspaceLevel = workspaces.find((w) => w.id === workspace)?.level ?? 0;
  const selectedWorkspaceLevel =
    workspaces.find((w) => w.id === (selected ?? editorItem)?.workspace_id)
      ?.level ?? 0;
  const canCreate = parent ? parentLevel >= 3 : workspaceLevel >= 3;
  const creationWorkspace = parent?.workspace_id ?? workspace;
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    let active = true;
    setWorkspaces([]);
    setRecipients([]);
    setItems([]);
    setEditorItem(null);
    setSelected(null);
    setParent(null);
    setTrail([]);
    setLoading(true);
    setError(null);
    void supabase.rpc("cvoa_drive_directory").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const ws = (data?.workspaces ?? []) as DriveWorkspace[];
      setWorkspaces(ws);
      setRecipients(data?.recipients ?? []);
      const preferred =
        ws.find((w) => linkedPost && w.post_id === linkedPost) ??
        ws.find((w) =>
          profile?.role === "state_commander"
            ? w.kind === "state" && w.state === profile.state
            : profile?.post_id
              ? w.post_id === profile.post_id
              : w.kind === "national",
        );
      setWorkspace(preferred?.id ?? ws[0]?.id ?? "");
      setView(ws.length ? "files" : "shared");
      refresh();
    });
    return () => {
      active = false;
    };
  }, [
    profile?.id,
    profile?.role,
    profile?.state,
    profile?.post_id,
    linkedPost,
  ]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setItems([]);
    void (async () => {
      try {
        const fav = await supabase
          .from("cvoa_drive_favorites")
          .select("item_id")
          .eq("profile_id", profile?.id ?? "");
        if (fav.error) throw fav.error;
        const ids = (fav.data ?? []).map((f) => f.item_id);
        let rows: DriveItem[] = [];
        if (view === "shared" && !parent) {
          const shared = await readAllRows<DriveShare>(() => {
            let q = supabase
              .from("cvoa_drive_shares")
              .select("*")
              .is("revoked_at", null)
              .order("id");
            return workspace
              ? q.or(
                  `recipient_workspace_id.eq.${workspace},legacy_all_members.eq.true`,
                )
              : q.eq("legacy_all_members", true);
          });
          const sharedIds = [
            ...new Set(
              shared
                .filter(
                  (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
                )
                .map((s) => s.item_id),
            ),
          ];
          if (sharedIds.length)
            rows = await readAllRows<DriveItem>(() =>
              supabase
                .from("cvoa_drive_items")
                .select(
                  "id,workspace_id,parent_id,kind,name,storage_path,mime_type,file_size,version,stage,is_template,deleted_at,updated_at,created_at",
                )
                .in("id", sharedIds)
                .is("deleted_at", null)
                .order("id"),
            );
        } else {
          rows = await readAllRows<DriveItem>(() => {
            let q = supabase
              .from("cvoa_drive_items")
              .select(
                "id,workspace_id,parent_id,kind,name,storage_path,mime_type,file_size,version,stage,is_template,deleted_at,updated_at,created_at",
              )
              .order("id");
            if (parent) q = q.eq("parent_id", parent.id);
            else if (view === "files")
              q = q.eq("workspace_id", workspace).is("parent_id", null);
            else if (view === "trash")
              q = q.eq("workspace_id", workspace).not("deleted_at", "is", null);
            else if (view === "templates") q = q.eq("is_template", true);
            else if (view === "starred")
              q = q.in(
                "id",
                ids.length ? ids : ["00000000-0000-0000-0000-000000000000"],
              );
            else if (view === "recent") q = q.eq("workspace_id", workspace);
            if (view !== "trash") q = q.is("deleted_at", null);
            return q;
          });
        }
        // Hide children of trashed ancestors in flattened views.
        if (
          view !== "trash" &&
          ["recent", "starred", "templates"].includes(view)
        ) {
          const live = await supabase.rpc("cvoa_drive_live_ids", {
            p_items: rows.map((i) => i.id),
          });
          if (live.error) throw live.error;
          const ids = new Set(live.data as string[]);
          rows = rows.filter((i) => ids.has(i.id));
        }
        rows.sort((a, b) =>
          view === "recent"
            ? b.updated_at.localeCompare(a.updated_at)
            : (a.kind === "folder" ? -1 : 1) - (b.kind === "folder" ? -1 : 1) ||
              a.name.localeCompare(b.name),
        );
        if (active) {
          setItems(rows);
          setFavorites(ids);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    workspace,
    parent?.id,
    view,
    version,
    profile?.id,
    profile?.role,
    profile?.state,
    profile?.post_id,
  ]);
  useEffect(() => {
    if (
      !linkedItem ||
      loading ||
      openedLink.current === `${profile?.id}:${linkedItem}`
    )
      return;
    openedLink.current = `${profile?.id}:${linkedItem}`;
    let active = true;
    void supabase
      .from("cvoa_drive_items")
      .select("*")
      .eq("id", linkedItem)
      .is("deleted_at", null)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(
            "This linked document is unavailable or has not been shared with your workspace.",
          );
          return;
        }
        void open(data as DriveItem);
      });
    return () => {
      active = false;
    };
  }, [linkedItem, loading, profile?.id]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(kind: "folder" | "document") {
    const name = window.prompt(
      kind === "folder" ? "Folder name" : "Document title",
    );
    if (!name?.trim()) return;
    await action(async () => {
      const r = await supabase.rpc("cvoa_drive_create", {
        p_workspace: creationWorkspace,
        p_parent: parent?.id ?? null,
        p_kind: kind,
        p_name: name.trim(),
        p_content: kind === "document" ? EMPTY_DOCUMENT : null,
      });
      if (r.error) throw r.error;
      if (kind === "document") {
        const item = await supabase
          .from("cvoa_drive_items")
          .select("*")
          .eq("id", r.data)
          .single();
        if (item.error) throw item.error;
        setEditorItem(item.data as DriveItem);
        setEditorLevel(parent ? parentLevel : workspaceLevel);
      }
    });
  }
  async function upload(e: ChangeEvent<HTMLInputElement>, replacement = false) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    await action(async () => {
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024)
          throw new Error("Choose files under 50 MB.");
        const id = replacement ? selected!.id : crypto.randomUUID(),
          ws = replacement ? selected!.workspace_id : creationWorkspace,
          path = driveBlobPath(
            ws,
            id,
            file.name,
            replacement ? selected!.parent_id : (parent?.id ?? null),
          );
        const blob = await supabase.storage
          .from("ncc-drive")
          .upload(path, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (blob.error) throw blob.error;
        const r = replacement
          ? await supabase.rpc("cvoa_drive_replace_file", {
              p_item: id,
              p_version: selected!.version,
              p_path: path,
              p_mime: file.type,
              p_size: file.size,
            })
          : await supabase.rpc("cvoa_drive_create", {
              p_workspace: ws,
              p_parent: parent?.id ?? null,
              p_kind: "file",
              p_name: file.name,
              p_path: path,
              p_mime: file.type,
              p_size: file.size,
              p_id: id,
            });
        if (r.error)
          throw new Error(
            `Upload reached storage but could not be registered: ${r.error.message}. Retry with Refresh; the existing document was preserved.`,
          );
      }
      if (replacement) setSelected(null);
    });
  }
  async function open(item: DriveItem) {
    if (item.kind === "folder") {
      await action(async () => {
        const r = await supabase.rpc("cvoa_drive_item_level", {
          p_item: item.id,
        });
        if (r.error) throw r.error;
        setParentLevel(r.data);
        setParent(item);
        setTrail((t) => [...t, item]);
        setSearch("");
      });
      return;
    }
    await action(async () => {
      const level = await supabase.rpc("cvoa_drive_item_level", {
        p_item: item.id,
      });
      if (level.error) throw level.error;
      const fresh = await supabase
        .from("cvoa_drive_items")
        .select("*")
        .eq("id", item.id)
        .single();
      if (fresh.error) throw fresh.error;
      if (item.kind === "document") {
        setEditorLevel(level.data);
        setEditorItem(fresh.data as DriveItem);
        return;
      }
      setSelected(fresh.data as DriveItem);
      setSelectedLevel(level.data);
      setUrl(null);
      await loadDetails(item);
      if (fresh.data.storage_path) {
        const signed = await supabase.storage
          .from("ncc-drive")
          .createSignedUrl(fresh.data.storage_path, 300);
        if (signed.error) throw signed.error;
        setUrl(signed.data.signedUrl);
      }
    });
  }
  async function loadDetails(item: DriveItem) {
    setShares([]);
    setHistory([]);
    setFolders([]);
    setRecipient("");
    setExpires("");
    setMoveTarget(item.parent_id ?? "");
    const [s, h, f] = await Promise.all([
      supabase
        .from("cvoa_drive_shares")
        .select("*")
        .eq("item_id", item.id)
        .is("revoked_at", null),
      supabase
        .from("cvoa_drive_revisions")
        .select("id,version,stage,created_at")
        .eq("item_id", item.id)
        .order("version", { ascending: false })
        .limit(50),
      supabase
        .from("cvoa_drive_items")
        .select("id,name,workspace_id")
        .eq("workspace_id", item.workspace_id)
        .eq("kind", "folder")
        .is("deleted_at", null)
        .order("name"),
    ]);
    for (const r of [s, h, f]) if (r.error) throw r.error;
    setShares(s.data ?? []);
    setHistory(h.data ?? []);
    setFolders((f.data ?? []) as DriveItem[]);
  }
  async function details(item: DriveItem) {
    await action(async () => {
      const r = await supabase.rpc("cvoa_drive_item_level", {
        p_item: item.id,
      });
      if (r.error) throw r.error;
      setSelectedLevel(r.data);
      setSelected(item);
      setUrl(null);
      await loadDetails(item);
    });
  }
  async function manage(
    item: DriveItem,
    which: string,
    name?: string,
    destination?: string,
  ) {
    await action(async () => {
      const r = await supabase.rpc("cvoa_drive_manage", {
        p_item: item.id,
        p_action: which,
        p_name: name ?? null,
        p_parent: destination || null,
      });
      if (r.error) throw r.error;
      setSelected(null);
    });
  }
  async function star(item: DriveItem) {
    await action(async () => {
      const r = favorites.includes(item.id)
        ? await supabase
            .from("cvoa_drive_favorites")
            .delete()
            .eq("item_id", item.id)
            .eq("profile_id", profile?.id ?? "")
        : await supabase
            .from("cvoa_drive_favorites")
            .insert({ item_id: item.id, profile_id: profile?.id });
      if (r.error) throw r.error;
    });
  }
  async function share() {
    if (!selected || !recipient) return;
    await action(async () => {
      const r = await supabase.rpc("cvoa_drive_share", {
        p_item: selected.id,
        p_recipient: recipient,
        p_permission: permission,
        p_expires: expires
          ? new Date(`${expires}T23:59:59`).toISOString()
          : null,
      });
      if (r.error) throw r.error;
      await loadDetails(selected);
    });
  }
  async function copyTemplate(item: DriveItem) {
    const destination =
      workspaces.find((w) => w.id === workspace && w.level >= 3) ??
      workspaces.find((w) => w.level >= 3);
    if (!destination) {
      setError("An editable workspace is required to make a working copy.");
      return;
    }
    const name = window.prompt(
      `Copy into ${destination.name}. New title:`,
      item.name + " — working copy",
    );
    if (!name?.trim()) return;
    await action(async () => {
      const source = await supabase
        .from("cvoa_drive_items")
        .select("content")
        .eq("id", item.id)
        .single();
      if (source.error) throw source.error;
      const r = await supabase.rpc("cvoa_drive_create", {
        p_workspace: destination.id,
        p_parent: null,
        p_kind: "document",
        p_name: name,
        p_content: source.data.content,
      });
      if (r.error) throw r.error;
      setWorkspace(destination.id);
      setParent(null);
      setTrail([]);
      setView("files");
    });
  }
  function changeView(v: View) {
    setView(v);
    setParent(null);
    setTrail([]);
    setSearch("");
  }
  const visible = items.filter((i) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (editorItem)
    return (
      <Suspense fallback={<p className="text-muted">Opening editor…</p>}>
        <DocumentEditor
          key={editorItem.id}
          item={editorItem}
          level={editorLevel}
          workspaceLevel={selectedWorkspaceLevel}
          onClose={() => {
            setEditorItem(null);
            refresh();
          }}
        />
      </Suspense>
    );
  return (
    <div>
      <PageHeader
        eyebrow="CVOA organizational workspaces"
        title="Documents & Files"
      />
      <p className="text-sm text-muted mb-5">
        One place for National, state, and post records. Workspace appointments
        determine access; explicit shares grant access to selected items.
      </p>
      <div className="flex flex-wrap items-end gap-4 mb-5">
        {workspaces.length > 0 && (
          <label className="text-sm flex-1">
            Workspace
            <select
              className="input-field mt-1"
              value={workspace}
              onChange={(e) => {
                setWorkspace(e.target.value);
                changeView("files");
              }}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ·{" "}
                  {w.level >= 3 ? "Manage / edit" : "Oversight · view"}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn-ghost" disabled={busy} onClick={refresh}>
          Refresh
        </button>
      </div>
      <nav aria-label="Document views" className="flex flex-wrap gap-2 mb-5">
        {(
          [
            "files",
            "shared",
            "recent",
            "starred",
            "templates",
            ...(workspaceLevel >= 3 ? ["trash"] : []),
          ] as View[]
        )
          .filter(
            (v) =>
              workspaces.length ||
              v === "shared" ||
              v === "starred" ||
              v === "templates",
          )
          .map((v) => (
            <button
              key={v}
              className={view === v ? "btn-gold" : "btn-ghost"}
              onClick={() => changeView(v)}
            >
              {v === "shared"
                ? "Shared with this workspace"
                : v === "files"
                  ? "Workspace files"
                  : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
      </nav>
      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            className="text-gold"
            onClick={() => {
              setParent(null);
              setTrail([]);
            }}
          >
            Root
          </button>
          {trail.map((f, n) => (
            <button
              key={f.id}
              className="text-gold"
              onClick={() => {
                setParent(f);
                setTrail((t) => t.slice(0, n + 1));
              }}
            >
              {" "}
              / {f.name}
            </button>
          ))}
        </div>
        {canCreate && (view === "files" || (view === "shared" && !!parent)) && (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => void create("folder")}
            >
              New folder
            </button>
            <button
              className="btn-gold"
              disabled={busy}
              onClick={() => void create("document")}
            >
              New document
            </button>
            <button
              className="btn-ghost flex gap-2 items-center"
              disabled={busy}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload size={15} />
              Upload files
            </button>
          </div>
        )}
      </div>
      <input
        ref={uploadRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void upload(e)}
      />
      <input
        ref={replaceRef}
        type="file"
        className="hidden"
        onChange={(e) => void upload(e, true)}
      />
      <label className="block text-sm mb-4">
        Search this view
        <input
          className="input-field mt-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="File or folder name"
        />
      </label>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {view === "trash" && (
        <p className="text-sm text-muted mb-4">
          Recoverable trash. Files are retained until an authorized retention
          process removes them. Restore parent folders before their children.
        </p>
      )}
      {!loading && !visible.length && !error && (
        <div className="panel p-6 text-muted">No items in this view.</div>
      )}
      {!!visible.length && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Name", "Status", "Updated", "Size", "Actions"].map((h) => (
                  <th key={h} className="table-head">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id}>
                  <td className="table-cell">
                    <div className="flex gap-2 items-center">
                      {i.kind === "folder" ? (
                        <Folder size={18} />
                      ) : (
                        <FileText size={18} />
                      )}
                      <button
                        className="text-gold text-left hover:underline"
                        disabled={busy || view === "trash"}
                        onClick={() => void open(i)}
                      >
                        {i.name}
                      </button>
                      {i.is_template && (
                        <span className="text-xs text-muted">Template</span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell capitalize">
                    {i.kind === "folder" ? "Folder" : i.stage}
                  </td>
                  <td className="table-cell text-muted">
                    {new Date(i.updated_at).toLocaleDateString()}
                  </td>
                  <td className="table-cell text-muted">
                    {i.kind === "document" ? "Document" : fileSize(i.file_size)}
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-3">
                      {view === "trash" ? (
                        <button
                          className="text-gold"
                          disabled={busy}
                          onClick={() => void manage(i, "restore")}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            aria-label={
                              favorites.includes(i.id)
                                ? `Unstar ${i.name}`
                                : `Star ${i.name}`
                            }
                            disabled={busy}
                            onClick={() => void star(i)}
                          >
                            <Star
                              size={16}
                              className={
                                favorites.includes(i.id)
                                  ? "text-gold fill-current"
                                  : "text-muted"
                              }
                            />
                          </button>
                          <button
                            className="text-gold"
                            disabled={busy}
                            onClick={() => void details(i)}
                          >
                            Details &amp; sharing
                          </button>
                          {i.kind === "document" && i.is_template && (
                            <button
                              className="text-gold"
                              disabled={busy}
                              onClick={() => void copyTemplate(i)}
                            >
                              Use template
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isNational && (
        <p className="text-xs text-muted mt-5">
          Native documents edit here. Uploaded spreadsheets and presentations
          are stored and downloadable; full Office editing requires the embedded
          office service to be configured.
        </p>
      )}
      {selected && (
        <Modal
          title={selected.name}
          onClose={() => {
            setSelected(null);
            setUrl(null);
          }}
        >
          <p className="text-sm text-muted mb-3">
            {selectedLevel >= 3
              ? "Editor"
              : selectedLevel >= 2
                ? "Commenter"
                : "Viewer"}{" "}
            · Version {selected.version} · {selected.stage}
          </p>
          {url && (
            <>
              <a
                className="btn-gold inline-block mb-4"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download file
              </a>
              {selected.mime_type?.startsWith("image/") ? (
                <img
                  src={url}
                  alt={selected.name}
                  className="max-h-72 mx-auto"
                />
              ) : selected.mime_type === "application/pdf" ? (
                <iframe
                  sandbox="allow-same-origin"
                  src={url}
                  title={selected.name}
                  className="w-full h-72"
                />
              ) : (
                <p className="text-sm text-muted">
                  Download this file to …38873 tokens truncated…await actor(member);await uroCommand(s,'vote',{id,choice:'no'});await actor(national);const state=await uroState(s);assert.equal(state.my_ballots.length,0);assert.equal(state.roll_calls.length,0);assert.ok(!JSON.stringify(state.events).includes('"choice"'));await failure(()=>db.query('select * from public.uro_ballots'),/permission denied/);
}));
test('URO freezes electorate, detects stale writes and blocks uncertified publication',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const id=await uroMotion(s),state=await uroState(s);await failure(()=>uroCommand(s,'attendance',{id:state.participants[0].id,presence:'left'}),/open vote/);await failure(()=>rpc('select public.uro_command($1,$2,$3::jsonb,1) data',[s,'vote',JSON.stringify({id,choice:'yes'})]),/changed/);await failure(()=>uroCommand(s,'publish_record'),/Certify/);
}));
test('URO quorum loss blocks binding business and guests do not count',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroCommand(s,'guest',{name:'Visiting observer'});const state=await uroState(s);await uroCommand(s,'attendance',{id:state.participants.find(p=>p.profile_id===national).id,presence:'present'});await uroCommand(s,'attendance',{id:state.participants.find(p=>p.guest).id,presence:'present'});await uroCommand(s,'start');assert.equal((await uroState(s)).quorum.present,1);await failure(()=>uroCommand(s,'propose',{kind:'main',text:'No quorum'}),/quorum/);
}));
test('URO certification, publication and correction remain distinct and author enforced',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);await uroCommand(s,'adjourn',{action_review_confirmed:true});await failure(()=>uroCommand(s,'certify'),/Secretary/);await actor(officer);await uroCommand(s,'certify');await uroCommand(s,'correct_record',{target:'Attendance spelling',previous:'Old',new:'Correct name',reason:'Verified spelling',authority:'Secretary factual correction'});const state=await uroState(s);assert.equal(state.session.minutes_state,'certified');assert.equal(state.session.published_at,null);assert.match(state.session.minutes,/CORRECTION ADDENDA/);assert.equal(state.corrections.length,1);await uroCommand(s,'publish_record');assert.ok((await uroState(s)).session.published_at);
}));
test('URO email notice jobs are authorized, idempotent and hidden from ordinary readers',()=>as(national,async()=>{
 const {s}=await uroSetup();const job=await rpc('select public.uro_prepare_notice($1) data',[s]);assert.equal(await rpc('select public.uro_prepare_notice($1) data',[s]),job);await failure(()=>db.query('select email from public.uro_notice_deliveries'),/permission denied/);await failure(()=>rpc('select public.uro_finish_notice($1) data',[job]),/permission denied/);await actor(member);await failure(()=>rpc('select public.uro_prepare_notice($1) data',[s]),/Assigned Chair or Secretary/);
}));
test('URO amendments require germaneness and default to majority rather than two thirds',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const parent=await uroCommand(s,'propose',{kind:'main',text:'Original proposal'}),id=await uroCommand(s,'propose',{kind:'amendment',parent_id:parent,text:'Amended exact text'});await failure(()=>uroCommand(s,'introduce',{id}),/germane/);await uroCommand(s,'introduce',{id,germaneness_reason:'Directly adjusts the pending proposal'});assert.equal((await uroState(s)).proposals.find(p=>p.id===id).threshold,'majority');await failure(()=>uroCommand(s,'propose',{kind:'amendment',parent_id:id,text:'Nested amendment'}),/One amendment/);
}));
test('URO Chair challenge asks to sustain and requires two thirds NO to reverse',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);await actor(member);const challenge=await uroCommand(s,'challenge',{kind:'point_of_procedure',body:'Procedure objection'});await actor(national);await uroCommand(s,'rule',{id:challenge,ruling:'Chair finding'});await actor(member);const id=await uroCommand(s,'propose',{kind:'chair_challenge',text:'Challenge existing ruling',context:{challenge_id:challenge}});await actor(officer);await uroCommand(s,'second',{id});await actor(national);await uroCommand(s,'introduce',{id});await uroCommand(s,'open_vote',{id,method:'digital'});await uroCommand(s,'vote',{id,choice:'no'});await actor(officer);await uroCommand(s,'vote',{id,choice:'no'});await actor(member);await uroCommand(s,'vote',{id,choice:'abstain'});await actor(national);await uroCommand(s,'close_vote',{id});const state=await uroState(s);assert.equal(state.challenges[0].disposition,'overturned');assert.equal(state.proposals[0].current_text,'Shall the ruling of the Chair be sustained?');
}));
test('URO missing recusal authority blocks affected votes and archived facts cannot be edited',()=>as(national,async()=>{
 const {s}=await uroSetup('national',{rules:{...uroRules,recusal_counts_quorum:null}});await uroStart(s);await actor(member);await uroCommand(s,'recuse',{reason:'Declared conflict'});await actor(national);assert.equal((await uroState(s)).quorum.recusal_rule_missing,true);await failure(()=>uroCommand(s,'propose',{kind:'main',text:'Conflicted vote'}),/quorum/);await uroCommand(s,'adjourn',{action_review_confirmed:true});await actor(officer);await uroCommand(s,'certify');await failure(()=>uroCommand(s,'agenda',{title:'Silent changed record',classification:'discussion'}),/Archived/);
}));
test('URO unfinished business carries forward and appears in staff queue',()=>as(national,async()=>{
 const {s,b}=await uroSetup('post');const agenda=await uroStart(s);await uroCommand(s,'action',{title:'Complete assignment',owner_id:officer,due_date:'2020-01-01'});await uroCommand(s,'adjourn',{action_review_confirmed:true});const queue=await rpc('select public.cvoa_action_queue() data');assert.ok(queue.items.some(i=>i.path===`/meetings/session/${s}`));const next=await rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'Follow up',type:'regular',scheduled_at:'2030-01-01T00:00:00Z'})]);assert.ok((await uroState(next)).agenda.some(a=>a.source_agenda_id===agenda));
}));
test('URO delivery completion records actual accepted recipients without duplicating notice events',()=>as(national,async()=>{
 const {s}=await uroSetup(),job=await rpc('select public.uro_prepare_notice($1) data',[s]);
 await db.exec("set local role service_role; select set_config('request.jwt.claim.role','service_role',true)");
 await db.query("update public.uro_notice_deliveries set state='sent',sent_at=now() where job_id=$1",[job]);const result=await rpc('select public.uro_finish_notice($1) data',[job]);assert.equal(result.sent,3);assert.equal(result.incomplete,0);await rpc('select public.uro_finish_notice($1) data',[job]);
 await db.exec("set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true)");
 const state=await uroState(s);assert.equal(state.notices.length,1);assert.equal(state.events.filter(e=>e.action==='NoticeDeliveryRecorded').length,1);await uroCommand(s,'agenda',{title:'Updated packet',classification:'discussion'});assert.notEqual(await rpc('select public.uro_prepare_notice($1) data',[s]),job);
}));
test('URO canceled vote ballots are preserved but never counted in a reopened vote',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const id=await uroMotion(s);await uroCommand(s,'vote',{id,choice:'yes'});await uroCommand(s,'cancel_vote',{id,reason:'Attendance correction'});await uroCommand(s,'stage',{state:'final_question'});await uroCommand(s,'open_vote',{id,method:'digital'});await uroCommand(s,'close_vote',{id,opportunity_confirmed:true});const state=await uroState(s),p=state.proposals[0];assert.equal(p.vote_round,2);assert.equal(p.result.yes,0);assert.equal(p.result.not_cast,3);assert.equal(p.status,'defeated');assert.equal(state.my_ballots.length,1);assert.equal(state.my_ballots[0].round,1);
}));


test('Meetings: commanders create post meetings, officers and ordinary members cannot',()=>as(national,async()=>{
 const {b}=await uroSetup('post', {chair_id:officer});
 await actor(officer);assert.equal(await rpc('select public.uro_body_manage($1) data',[b]),true);
 const meeting=await rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'Commander scheduled',type:'regular',scheduled_at:'2030-01-01T00:00:00Z'})]);assert.ok(meeting);await uroCommand(meeting,'start');assert.ok((await uroState(meeting)).session.started_at);const pending=await rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'Pending commander meeting',type:'regular',scheduled_at:'2030-01-02T00:00:00Z'})]);
 await db.exec('reset role');await db.query("update public.profiles set role='post_officer' where id=$1",[officer]);await db.exec('set local role authenticated');await actor(officer);
 assert.equal(await rpc('select public.uro_body_manage($1) data',[b]),false);
 await failure(()=>db.query("insert into public.uro_meetings(post_id,title,meeting_date,created_by) values($1,'Denied legacy',current_date,$2)",[post,officer]),/row-level security/);
 await failure(()=>rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'Denied',type:'regular',scheduled_at:'2030-01-01T00:00:00Z'})]),/administration/);
 await failure(()=>rpc('select public.uro_body_setup(null,$1::jsonb) data',[JSON.stringify({jurisdiction:'post',post_id:post})]),/Jurisdiction/);
 await failure(()=>uroCommand(pending,'start'),/post commander/);
 await actor(member);await failure(()=>rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'Denied',type:'regular',scheduled_at:'2030-01-01T00:00:00Z'})]),/administration/);
}));

test('Meetings: post members browse upcoming metadata and read published records without roster or vote rights',()=>as(national,async()=>{
 const {s,b}=await uroSetup('post');await uroStart(s);await uroCommand(s,'adjourn',{action_review_confirmed:true});await actor(officer);await uroCommand(s,'certify');
 await actor(national);await db.exec('reset role');await db.query('delete from public.uro_participants where meeting_id=$1 and profile_id=$2',[s,member]);await db.query('update public.uro_body_members set active=false where body_id=$1 and profile_id=$2',[b,member]);await db.exec('set local role authenticated');await actor(member);
 const directory=await rpc('select public.uro_directory() data');const summary=directory.sessions.find(x=>x.id===s);assert.equal(summary.readable,false);assert.ok(!('minutes' in summary));
 await failure(()=>uroState(s),/Meeting access/);await failure(()=>rpc('select public.uro_registry($1) data',[b]),/Body access/);
 await actor(officer);await uroCommand(s,'publish_record');await actor(member);assert.ok((await uroState(s)).session.minutes);assert.equal((await uroState(s)).permissions.manage,false);
 await failure(()=>uroCommand(s,'publish_record'),/Certify/);await actor(guest);await failure(()=>uroState(s),/Meeting access/);
 await actor(stateCommander);assert.equal((await uroState(s)).body.post_id,post);
}));


async function sponsorFixture(){const r=await db.query("insert into public.sponsors(post_id,company,stage,sponsorship_value) values($1,'Sponsor example','identified',100) returning *",[post]);return r.rows[0]}
async function sponsorSave(s,data){return rpc('select public.cvoa_sponsor_save($1,$2,$3::jsonb) data',[s.id,s.workflow_version,JSON.stringify(data)])}

test('Sponsorship members manage only their affiliated post and states remain scoped',()=>as(national,async()=>{
 const s=await sponsorFixture();await actor(member);assert.equal((await db.query('select * from public.sponsors where id=$1',[s.id])).rows.length,1);
 const updated=await sponsorSave(s,{sponsorship_value:250.75});assert.equal(Number(updated.sponsorship_value),250.75);
 await failure(()=>sponsorSave(s,{sponsorship_value:500}),/changed/);
 await failure(()=>db.query("update public.sponsors set stage='won' where id=$1",[s.id]),/permission denied/);
 await actor(stateCommander);assert.equal((await db.query('select * from public.sponsors where id=$1',[s.id])).rows.length,1);
 await actor(guest);assert.equal((await db.query('select * from public.sponsors where id=$1',[s.id])).rows.length,0);await failure(()=>sponsorSave(updated,{sponsorship_value:1}),/workspace/);
}));

test('Sponsorship advancement requires contact evidence, valid meetings and a saved proposal',()=>as(national,async()=>{
 let s=await sponsorFixture();await failure(()=>sponsorSave(s,{stage:'contacted',person:'Manager',summary:'Discussed',email:'manager@example.test'}),/Record who/);
 s=await sponsorSave(s,{stage:'contacted',person:'Manager',method:'phone',summary:'Discussed support and a follow-up',email:'manager@example.test'});
 assert.equal((await db.query('select * from public.sponsor_activity where sponsor_id=$1',[s.id])).rows.length,1);
 await failure(()=>sponsorSave(s,{stage:'meeting_scheduled',meeting_with:'Manager',meeting_start:'2030-01-02T13:00:00Z',meeting_end:'2030-01-02T12:00:00Z'}),/Choose a meeting/);
 s=await sponsorSave(s,{stage:'meeting_scheduled',meeting_with:'Manager',meeting_start:'2030-01-02T13:00:00Z',meeting_end:'2030-01-02T14:00:00Z'});
 await failure(()=>sponsorSave(s,{stage:'proposal_sent'}),/Write or upload/);
 s=await sponsorSave(s,{stage:'proposal_sent',proposal_text:'Community sponsorship proposal'});assert.equal(s.proposal_text,'Community sponsorship proposal');
 await failure(()=>sponsorSave(s,{proposal_storage_path:otherPost+'/foreign.pdf'}),/Upload the proposal/);
}));

test('Sponsorship offline records cannot forge card receipts or another post',()=>as(national,async()=>{
 const s=await sponsorFixture();await actor(member);
 await failure(()=>db.query("insert into public.sponsor_payments(post_id,sponsor_id,amount,payment_method,recorded_by) values($1,$2,10,'card',$3)",[post,s.id,member]),/row-level security/);
 await failure(()=>db.query("insert into public.sponsor_payments(post_id,sponsor_id,amount,payment_method,recorded_by) values($1,$2,10,'cash',$3)",[otherPost,s.id,member]),/row-level security/);
 await db.query("insert into public.sponsor_payments(post_id,sponsor_id,amount,payment_method,recorded_by) values($1,$2,10,'cash',$3)",[post,s.id,member]);
}));

test('Sponsorship Stripe fulfillment is service-only, exact, idempotent and independent of later pledge edits',()=>as(national,async()=>{
 let s=await sponsorFixture();await actor(member);const id=uid(9920);
 const request=await rpc('select public.cvoa_sponsor_request($1,$2,$3) data',[s.id,49.99,id]);assert.equal(request.amount_cents,4999);
 await failure(()=>rpc('select public.cvoa_sponsor_request($1,$2,$3) data',[s.id,19.99,id]),/do not match/);
 s=await sponsorSave(s,{sponsorship_value:500});
 await failure(()=>rpc("select public.cvoa_fulfill_sponsor_payment($1,'cs_test_example',4999,'usd','pi_example',now(),false) data",[id]),/permission denied/);
 await db.exec('reset role');await db.query("update public.sponsor_checkout_requests set session_id='cs_test_example',status='open',livemode=false where id=$1",[id]);
 await db.exec('set local role service_role');
 await failure(()=>rpc("select public.cvoa_fulfill_sponsor_payment($1,'cs_test_example',5000,'usd','pi_example',now(),false) data",[id]),/does not match/);
 await failure(()=>rpc("select public.cvoa_fulfill_sponsor_payment($1,'cs_test_example',4999,'eur','pi_example',now(),false) data",[id]),/does not match/);
 await failure(()=>rpc("select public.cvoa_fulfill_sponsor_payment($1,'cs_test_example',4999,'usd','pi_example',now(),true) data",[id]),/does not match/);
 assert.equal(await rpc("select public.cvoa_fulfill_sponsor_payment($1,'cs_test_example',4999,'usd','pi_example',now(),false) data",[id]),true);
 assert.equal(await rpc("select public.cvoa_fulfill_sponsor_payment($1,'cs_test_example',4999,'usd','pi_example',now(),false) data",[id]),false);
 await rpc("select public.cvoa_sponsor_refund('pi_example',2500) data");await rpc("select public.cvoa_sponsor_refund('pi_example',2500) data");
 await db.exec('set local role authenticated');await actor(member);
 const payments=(await db.query('select * from public.sponsor_payments where checkout_request_id=$1',[id])).rows;assert.equal(payments.length,1);assert.equal(Number(payments[0].amount),49.99);assert.equal(Number(payments[0].refunded_amount),25);assert.equal(payments[0].stripe_livemode,false);
 await actor(national);assert.equal((await db.query('delete from public.sponsor_payments where checkout_request_id=$1 returning id',[id])).rows.length,0);
}));

test('Sponsorship files follow the sponsor post and public interest cannot forge a closed deal',()=>as(national,async()=>{
 const s=await sponsorFixture();await actor(member);
 await db.query("insert into storage.objects(bucket_id,name) values('sponsor-agreements',$1)",[s.id+'/proposals/example.pdf']);
 await actor(guest);assert.equal((await db.query("select * from storage.objects where bucket_id='sponsor-agreements' and name=$1",[s.id+'/proposals/example.pdf'])).rows.length,0);
 await db.exec("set local role anon; select set_config('request.jwt.claim.role','anon',true)");await actor(null);
 await failure(()=>db.query("insert into public.sponsors(post_id,company,stage,sponsorship_value) values($1,'Forged','won',1000)",[post]),/row-level security/);
 await db.query("insert into public.sponsors(post_id,company,stage,sponsorship_value) values($1,'Public interest','identified',100)",[post]);
}));

async function launch(postId=post){await db.query('select public.cvoa_launch_mutate($1,0,$2,$3::jsonb)',[postId,'initialize',JSON.stringify({owner_name:'Launch Lead'})]); const p=await rpc('select to_jsonb(p) data from public.post_launch_plans p where post_id=$1',[postId]);await db.query('select public.cvoa_launch_mutate($1,$2,$3,$4::jsonb)',[postId,p.version,'plan',JSON.stringify({owner_name:'Launch Lead',target_date:'2030-01-01',services:'Member services'})]);}
async function launchCommand(action,data={},postId=post){const p=await rpc('select to_jsonb(p) data from public.post_launch_plans p where post_id=$1',[postId]);await db.query('select public.cvoa_launch_mutate($1,$2,$3,$4::jsonb)',[postId,p.version,action,JSON.stringify(data)]);}
async function location(data={}){await launchCommand('location',{name:'Candidate Space',address:'123 Main Street',tenure:'lease',monthly_cost_cents:100000,upfront_cost_cents:200000,...data});return (await db.query('select * from public.launch_locations where post_id=$1 order by id',[post])).rows[0];}
test('Post Development uses staff scope, rejects raw writes and detects stale saves',()=>as(national,async()=>{
 await launch();await launch(otherPost);
 await actor(officer);const directory=await rpc('select public.cvoa_launch_directory() data');assert.equal(directory.length,1);assert.equal(directory[0].id,post);
 await failure(()=>launch(otherPost),/Post staff access/);await failure(()=>db.query("update public.post_launch_plans set stage='open'"),/permission denied/);
 await launchCommand('plan',{owner_name:'Lead',target_date:'2030-01-01',services:'Member space'});
 await failure(()=>db.query('select public.cvoa_launch_mutate($1,1,$2,$3::jsonb)',[post,'plan','{}']),/Refresh/);
 await actor(stateCommander);assert.equal((await rpc('select public.cvoa_launch_directory() data')).length,1);await failure(()=>launchCommand('plan',{}),/Post staff access/);
 await actor(member);assert.equal((await rpc('select public.cvoa_launch_directory() data')).length,0);await failure(()=>launch(),/Post staff access/);
 await actor(tribunal);assert.equal((await rpc('select public.cvoa_launch_directory() data')).length,0);
}));
test('Location decisions are National-only, preserve snapshots and invalidate when a proposal changes',()=>as(national,async()=>{
 await db.query("update public.posts set status='approved' where id=$1",[post]);await launch();await actor(officer);const l=await location();await launchCommand('location_submit',{id:l.id});
 await failure(()=>launchCommand('location_review',{id:l.id,decision:'approved',feedback:'Reviewed'}),/National review/);
 await actor(national);await launchCommand('location_review',{id:l.id,decision:'approved',feedback:'Approved starter space; education office planned later.'});
 assert.equal((await db.query('select stage from public.post_launch_plans where post_id=$1',[post])).rows[0].stage,'setup');
 const review=(await db.query('select * from public.launch_reviews where location_id=$1',[l.id])).rows[0];assert.equal(review.snapshot.location.address,'123 Main Street');assert.equal(review.snapshot.location.revision,1);
 await actor(officer);await launchCommand('location',{...l,address:'456 Different Street'});
 assert.equal((await db.query('select status from public.launch_locations where id=$1',[l.id])).rows[0].status,'draft');assert.equal((await db.query('select stage from public.post_launch_plans where post_id=$1',[post])).rows[0].stage,'location_review');
 assert.equal((await db.query('select snapshot from public.launch_reviews where location_id=$1',[l.id])).rows[0].snapshot.location.address,'123 Main Street');
}));
test('Required standards, secured location and National opening approval gate the active post status',()=>as(national,async()=>{
 await db.query("update public.posts set status='approved' where id=$1",[post]);await launch();
 await db.query("select public.cvoa_launch_standard(null,'Required floor plan','location',true,true)");const std=(await db.query("select id from public.launch_standards where label='Required floor plan'")).rows[0].id;
 const l=await location();await failure(()=>launchCommand('location_submit',{id:l.id}),/required location standards/);
 await launchCommand('location_check',{location_id:l.id,standard_id:std,response:'yes',note:'Plan reviewed'});await launchCommand('location_submit',{id:l.id});await launchCommand('location_review',{id:l.id,decision:'approved',feedback:'Meets required standard'});
 await failure(()=>db.query("update public.posts set status='active_post' where id=$1",[post]),/Post Development/);
 await failure(()=>launchCommand('stage',{stage:'opening_review'}),/secured location/);
 await launchCommand('location_secured',{secured:true});await launchCommand('task',{label:'Required opening item',required:true,complete:false});
 const t=(await db.query("select * from public.launch_tasks where label='Required opening item'")).rows[0];
 await failure(()=>launchCommand('stage',{stage:'opening_review'}),/required launch tasks/);
 await actor(officer);await failure(()=>launchCommand('task',{...t,label:'Removed requirement'}),/Only National changes/);await launchCommand('task',{...t,complete:true});await launchCommand('stage',{stage:'opening_review'});await failure(()=>launchCommand('stage',{stage:'open',feedback:'Ready'}),/National opening/);
 await actor(national);await launchCommand('stage',{stage:'open',feedback:'Opening approved; funding and readiness reviewed.'});assert.equal((await db.query('select status from public.posts where id=$1',[post])).rows[0].status,'active_post');assert.equal((await db.query('select stage from public.post_launch_plans where post_id=$1',[post])).rows[0].stage,'open');
}));
test('Connected funding counts allocated receipts once, deducts refunds and links each new expense to one ledger row',()=>as(national,async()=>{
 await launch();const campaign=await rpc('select public.cvoa_launch_campaign($1,null,$2::jsonb) data',[post,JSON.stringify({title:'Opening Fund',goal_cents:100000,owner_name:'Lead',deadline:'2030-01-01',launch_funding:true})]);
 await db.query('select public.cvoa_launch_entry($1,$2,$3,$4,$5,null)',[campaign,'income',5000,'2026-10-05','Cash donation']);await db.query('select public.cvoa_launch_entry($1,$2,$3,$4,$5,null)',[campaign,'expense',1000,'2026-10-05','Event costs']);
 assert.equal((await db.query('select count(*)::int n from public.financial_transactions where post_id=$1',[post])).rows[0].n,2);
 const pay=(await db.query("insert into public.sponsor_payments(post_id,amount,payment_method,recorded_by) values($1,100,'cash',$2) returning id",[post,national])).rows[0].id;
 await db.query('select public.cvoa_launch_allocate($1,$2)',[pay,campaign]);await db.query('select public.cvoa_launch_allocate($1,$2)',[pay,campaign]);
 const totals=await rpc('select public.cvoa_launch_totals($1) data',[post]);assert.equal(totals.received_cents,15000);assert.equal(totals.spent_cents,1000);assert.equal(totals.available_cents,14000);
 const foreign=(await db.query("insert into public.sponsor_payments(post_id,amount,payment_method,recorded_by) values($1,100,'cash',$2) returning id",[otherPost,national])).rows[0].id;await failure(()=>db.query('select public.cvoa_launch_allocate($1,$2)',[foreign,campaign]),/this post/);
 await actor(officer);await failure(()=>db.query('select public.cvoa_launch_campaign($1,$2,$3::jsonb)',[otherPost,campaign,'{}']),/staff access/);
}));
test('Public campaign exposure needs National approval; exact Stripe receipts are service-only, idempotent and refund-aware',()=>as(national,async()=>{
 const data={title:'Location Fund',goal_cents:100000,owner_name:'Lead',deadline:'2030-01-01',launch_funding:true,story:'Public campaign story',published:true};
 await actor(officer);await failure(()=>db.query('select public.cvoa_launch_campaign($1,null,$2::jsonb)',[post,JSON.stringify(data)]),/National approves/);await failure(()=>db.query("insert into public.fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline,published,created_by) values($1,'Forged',100,'Lead','2030-01-01',true,$2)",[post,officer]),/permission denied/);
 await actor(national);const c=await rpc('select public.cvoa_launch_campaign($1,null,$2::jsonb) data',[post,JSON.stringify(data)]);await db.query("update public.fundraising_campaigns set status='active' where id=$1",[c]);const slug=(await db.query('select public_slug from public.fundraising_campaigns where id=$1',[c])).rows[0].public_slug;
 await failure(()=>db.query('select public.cvoa_campaign_request($1,100,$2)',[slug,uid(9950)]),/permission denied/);
 await db.exec('set local role service_role');const request=await rpc('select public.cvoa_campaign_request($1,4999,$2) data',[slug,uid(9950)]);assert.equal(request.amount_cents,4999);await db.query("update public.campaign_checkout_requests set session_id='cs_test_campaign',livemode=false where id=$1",[request.id]);
 await failure(()=>db.query("select public.cvoa_campaign_fulfill($1,'cs_test_campaign',100,'usd','pi_campaign',now(),false)",[request.id]),/does not match/);
 assert.equal(await rpc("select public.cvoa_campaign_fulfill($1,'cs_test_campaign',4999,'usd','pi_campaign',now(),false) data",[request.id]),true);assert.equal(await rpc("select public.cvoa_campaign_fulfill($1,'cs_test_campaign',4999,'usd','pi_campaign',now(),false) data",[request.id]),false);
 await db.exec('set local role authenticated');await actor(national);assert.equal((await rpc('select public.cvoa_public_campaign($1) data',[slug])).received_cents,0);
 await db.exec('set local role service_role');const live=await rpc('select public.cvoa_campaign_request($1,10000,$2) data',[slug,uid(9951)]);await db.query("update public.campaign_checkout_requests set session_id='cs_live_campaign',livemode=true where id=$1",[live.id]);await db.query("select public.cvoa_campaign_fulfill($1,'cs_live_campaign',10000,'usd','pi_live_campaign',now(),true)",[live.id]);await db.query("select public.cvoa_campaign_refund('pi_live_campaign',2500)");await db.query("select public.cvoa_campaign_refund('pi_live_campaign',1000)");
 await db.exec('set local role anon');const pub=await rpc('select public.cvoa_public_campaign($1) data',[slug]);assert.equal(pub.received_cents,7500);assert.equal(pub.owner_name,undefined);assert.equal(pub.documents,undefined);await failure(()=>db.query('select * from public.launch_locations'),/permission denied/);
 await db.exec('set local role authenticated');await actor(officer);await db.query('select public.cvoa_launch_campaign($1,$2,$3::jsonb)',[post,c,JSON.stringify({...data,title:'Changed public promise'})]);assert.equal(await rpc('select public.cvoa_public_campaign($1) data',[slug]),null);
}));

test('Launch expense linked to a facility project is not counted twice and later improvements stay out of the opening budget',()=>as(national,async()=>{
 await launch();const module=(await db.query("insert into public.build_a_post_modules(name) values('Launch Facility') returning id")).rows[0].id;
 const project=(await db.query("insert into public.post_facility_projects(post_id,module_id,target_budget,created_by) values($1,$2,1000,$3) returning id",[post,module,national])).rows[0].id;
 const c=await rpc('select public.cvoa_launch_campaign($1,null,$2::jsonb) data',[post,JSON.stringify({title:'Opening',goal_cents:100000,owner_name:'Lead',deadline:'2030-01-01',launch_funding:true})]);
 await db.query('select public.cvoa_launch_entry($1,$2,$3,$4,$5,$6)',[c,'expense',10000,'2026-10-05','Equipment',project]);
 let totals=await rpc('select public.cvoa_launch_totals($1) data',[post]);assert.equal(totals.spent_cents,10000);assert.equal(totals.budget_cents,100000);
 await db.query('update public.post_facility_projects set opening_scope=false where id=$1',[project]);totals=await rpc('select public.cvoa_launch_totals($1) data',[post]);assert.equal(totals.budget_cents,0);assert.equal(totals.spent_cents,10000);
}));
test('Required facility projects cannot be removed by post staff and block readiness until complete',()=>as(national,async()=>{
 await db.query("update public.posts set status='approved' where id=$1",[post]);await launch();const l=await location();await launchCommand('location_submit',{id:l.id});await launchCommand('location_review',{id:l.id,decision:'approved',feedback:'Approved'});await launchCommand('location_secured',{secured:true});
 const m=(await db.query("insert into public.build_a_post_modules(name) values('Required Setup') returning id")).rows[0].id;
 const f=(await db.query("insert into public.post_facility_projects(post_id,module_id,required_for_opening,created_by) values($1,$2,true,$3) returning id",[post,m,national])).rows[0].id;
 const item=(await db.query("insert into public.post_facility_checklist_items(project_id,label) values($1,'Required installation') returning id",[f])).rows[0].id;
 await actor(officer);await failure(()=>db.query('delete from public.post_facility_projects where id=$1',[f]),/National controls/);await failure(()=>db.query('delete from public.post_facility_checklist_items where id=$1',[item]),/National controls/);await failure(()=>launchCommand('stage',{stage:'opening_review'}),/required facility projects/);
 await db.query("update public.post_facility_projects set status='complete' where id=$1",[f]);await failure(()=>launchCommand('stage',{stage:'opening_review'}),/required facility projects/);await db.query('update public.post_facility_checklist_items set is_complete=true where id=$1',[item]);await launchCommand('stage',{stage:'opening_review'});
}));
test('Launch documents must belong to the post drive and are private across states',()=>as(national,async()=>{
 await launch();const workspace=(await db.query("select id from public.cvoa_drive_workspaces where post_id=$1",[post])).rows[0].id;const item=uid(9981),path=`${workspace}/${item}/root/lease.pdf`;
 await db.query("insert into storage.objects(bucket_id,name) values('ncc-drive',$1)",[path]);
 await db.query("select public.cvoa_drive_create($1,null,'file','Proposed Lease',null,$2,'application/pdf',100,$3)",[workspace,path,item]);await launchCommand('document',{name:'Proposed Lease',path});
 assert.equal((await db.query("select count(*)::int n from storage.objects where name=$1",[path])).rows[0].n,1);
 await actor(stateCommander);assert.equal((await db.query('select count(*)::int n from public.launch_documents')).rows[0].n,1);
 await actor(member);assert.equal((await db.query('select count(*)::int n from public.launch_documents')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from storage.objects where name=$1',[path])).rows[0].n,0);
 await actor(officer);await failure(()=>launchCommand('document',{name:'Foreign attachment',path:'other-post/file.pdf'}),/post drive/);
}));
test('National dashboard queue includes launch review and help while state and post queues stay scoped',()=>as(national,async()=>{
 await launch();await launchCommand('plan',{owner_name:'Lead',target_date:'2030-01-01',services:'Opening',help_needed:'Need a location contact'});const l=await location();await launchCommand('location_submit',{id:l.id});await launchCommand('task',{label:'Overdue launch assignment',due_date:'2020-01-01'});
 const queue=await rpc('select public.cvoa_action_queue() data');assert.ok(queue.items.some(i=>i.id===`launch-location:${l.id}`));assert.ok(queue.items.some(i=>i.path.includes('/post-development?post=')));
 await actor(stateCommander);const state=await rpc('select public.cvoa_action_queue() data');assert.ok(state.items.some(i=>i.id.startsWith('launch-help:')));assert.equal(state.items.some(i=>i.id.startsWith('launch-location:')),false);
}));
test('Voiding a duplicate or incorrect fundraising entry preserves history and offsets the connected ledger once',()=>as(national,async()=>{
 await launch();const c=await rpc('select public.cvoa_launch_campaign($1,null,$2::jsonb) data',[post,JSON.stringify({title:'Opening',goal_cents:10000,owner_name:'Lead',deadline:'2030-01-01',launch_funding:true})]);
 await db.query('select public.cvoa_launch_entry($1,$2,$3,$4,$5,null)',[c,'income',5000,'2026-10-05','Incorrect duplicate']);const e=(await db.query('select * from public.fundraising_entries where campaign_id=$1',[c])).rows[0];
 await actor(stateCommander);await failure(()=>db.query('select public.cvoa_launch_void_entry($1,$2)',[e.id,'Duplicate']),/Entry unavailable/);
 await actor(officer);await db.query('select public.cvoa_launch_void_entry($1,$2)',[e.id,'Duplicate sponsor receipt']);await db.query('select public.cvoa_launch_void_entry($1,$2)',[e.id,'Repeated request']);
 assert.equal((await rpc('select public.cvoa_launch_totals($1) data',[post])).received_cents,0);assert.ok((await db.query('select * from public.fundraising_entries where id=$1',[e.id])).rows[0].voided_at);assert.equal((await db.query('select count(*)::int n from public.financial_transactions where post_id=$1',[post])).rows[0].n,2);
}));

test('Post dashboard is scoped to staff oversight, denies members and delegates, and separates management authority', async()=>{
 await as(national,async()=>{const r=await db.query(`select public.cvoa_post_dashboard('${post}') as dashboard`);assert.equal(r.rows[0].dashboard.can_manage,true);assert.equal(r.rows[0].dashboard.post.id,post);assert.ok(Array.isArray(r.rows[0].dashboard.meetings));assert.ok(Array.isArray(r.rows[0].dashboard.tasks));});
 await as(uid(5),async()=>{const r=await db.query(`select public.cvoa_post_dashboard('${post}') as dashboard`);assert.equal(r.rows[0].dashboard.can_manage,false);});
 for(const actor of [uid(5),officer])await as(actor,async()=>{await assert.rejects(db.query(`select public.cvoa_post_dashboard('${otherPost}')`),/outside your appointed jurisdiction/)});
 for(const actor of [member,uid(6),uid(7)])await as(actor,async()=>{await assert.rejects(db.query(`select public.cvoa_post_dashboard('${post}')`),/outside your appointed jurisdiction/)});
 await as(null,async()=>{await assert.rejects(db.query(`select public.cvoa_post_dashboard('${post}')`),/permission denied/)},'anon');
});
test('Post dashboard combines current URO meetings and actions with legacy records without importing future receipts into received totals',async()=>{
 await as(national,async()=>{
  await db.exec(`reset role;insert into public.uro_bodies(id,name,jurisdiction,post_id) values('${uid(9001)}','Post A current body','post','${post}');
   insert into public.uro_sessions(id,body_id,title,type,scheduled_at,rules) values('${uid(9002)}','${uid(9001)}','Scheduled current meeting','regular',now()+interval '2 days','{}');
   insert into public.uro_actions(meeting_id,title,due_date) values('${uid(9002)}','Unassigned current action',current_date-2);
   insert into public.uro_action_items(meeting_id,post_id,description,owner_name,due_date) select id,post_id,'Legacy current action','Recorded owner',current_date-1 from public.uro_meetings where post_id='${post}' limit 1;
   insert into public.sponsor_payments(post_id,amount,payment_method,payment_date,recorded_by) values('${post}',25,'cash',current_date,'${national}'),('${post}',100,'cash',current_date+5,'${national}');set local role authenticated;`);
  const r=await db.query(`select public.cvoa_post_dashboard('${post}') as d`),d=r.rows[0].d;
  assert.ok(d.meetings.some(m=>m.title==='Scheduled current meeting'&&m.status==='scheduled'&&!m.published_at));
  assert.ok(d.tasks.some(t=>t.title==='Unassigned current action'&&!t.owner));assert.ok(d.tasks.some(t=>t.title==='Legacy current action'&&t.owner==='Recorded owner'));assert.equal(d.sponsorship.received,25);
 });
});
test('Current health evidence requires verified linked staff, nets actual sponsor refunds, and limits Congress to eligible recent formal votes',async()=>{
 await as(national,async()=>{
  await db.exec(`reset role;insert into public.founding_team_members(post_id,name,position,profile_id,dd214_reviewed,combat_service_verified,membership_approved,verification_status) values('${post}','Linked Commander','commander','${officer}',true,true,true,'verified'),('${post}','Unlinked Officer','adjutant',null,true,true,true,'verified');
   insert into public.sponsors(id,post_id,company,stage,sponsorship_value) values('${uid(9011)}','${post}','Actual sponsor','won',9999);
   insert into public.sponsor_payments(post_id,sponsor_id,amount,payment_method,recorded_by) values('${post}','${uid(9011)}',50,'cash','${national}');set local role authenticated;`);
  const r=await db.query(`select public.cvoa_post_health_evidence(array['${post}'::uuid]) as e`),e=r.rows[0].e[post];
  assert.equal(e.current_officers.length,1);assert.equal(e.current_officers[0].profile_id,officer);assert.equal(e.sponsor_receipts[0].amount,50);assert.equal(e.has_delegate,true);assert.ok(e.eligible_votes>=1);assert.equal(e.votes_cast,0);
 });
 await as(officer,async()=>{await assert.rejects(db.query(`select public.cvoa_post_health_evidence(array['${post}'::uuid,'${otherPost}'::uuid])`),/outside your appointed jurisdiction/)});
});
test('Annual completion requires every item and evidence; changing a completed checklist reopens it',async()=>{
 await as(officer,async()=>{await assert.rejects(db.query(`insert into public.annual_reviews(post_id,review_year,completed_at) values('${post}',2091,now())`),/Complete all review items/)});
 await as(officer,async()=>{
  await db.exec(`insert into public.annual_reviews(post_id,review_year,bylaws_reviewed,financial_audit_complete,officer_roster_current,required_filings_current,notes,completed_at) values('${post}',2091,true,true,true,true,'Evidence: post drive review packet',now());`);
  let r=await db.query(`select completed_at,reviewed_by from public.annual_reviews where post_id='${post}' and review_year=2091`);assert.ok(r.rows[0].completed_at);assert.equal(r.rows[0].reviewed_by,officer);
  await db.exec(`update public.annual_reviews set bylaws_reviewed=false where post_id='${post}' and review_year=2091`);
  r=await db.query(`select completed_at,reviewed_by from public.annual_reviews where post_id='${post}' and review_year=2091`);assert.equal(r.rows[0].completed_at,null);assert.equal(r.rows[0].reviewed_by,null);
 });
});
test('Governance signatures require linked current officer identities and cannot be forged with a matching name',async()=>{
 await as(officer,async()=>{await assert.rejects(db.query(`insert into public.governance_signatures(post_id,signer_name,form_type,signed_at) values('${post}','Officer','conflict_of_interest',now())`),/Select a linked officer/)});
 await as(officer,async()=>{
  await db.exec(`reset role;insert into public.founding_team_members(post_id,name,position,profile_id) values('${post}','Officer roster name','commander','${officer}');set local role authenticated;
   insert into public.governance_signatures(post_id,profile_id,signer_name,form_type,signed_at,recorded_by) values('${post}','${officer}','Spoofed identity','conflict_of_interest',now(),'${national}');`);
  const r=await db.query(`select signer_name,recorded_by from public.governance_signatures where post_id='${post}' and profile_id='${officer}'`);assert.equal(r.rows[0].signer_name,'Officer');assert.equal(r.rows[0].recorded_by,officer);
 });
});
test('Post archive is National-only, audited, reversible, preserves records and blocks public campaign checkout',async()=>{
 for(const actor of [officer,uid(5),member])await as(actor,async()=>{await assert.rejects(db.query(`select public.cvoa_post_archive('${post}',true,'Recorded archive reason')`),/National administration required/)});
 await as(national,async()=>{await assert.rejects(db.query(`update public.posts set archived_at=now(),archived_reason='Bypass archive' where id='${post}'`),/audited National archive/)});
 await as(national,async()=>{
  const camp=await db.query(`select public.cvoa_launch_campaign('${post}',null,'{"title":"Archived campaign","goal_cents":10000,"published":true,"owner_name":"National lead","deadline":"2030-01-01","story":"Published campaign story"}') as id`),campaign=camp.rows[0].id;
  await db.query(`update public.fundraising_campaigns set status='active' where id='${campaign}'`);
  const slug=(await db.query(`select public_slug from public.fundraising_campaigns where id='${campaign}'`)).rows[0].public_slug;
  const before=(await db.query(`select count(*) from public.members where post_id='${post}'`)).rows[0].count;
  await db.exec(`select public.cvoa_post_archive('${post}',true,'Temporarily inactive operations')`);
  const d=(await db.query(`select public.cvoa_post_dashboard('${post}') as d`)).rows[0].d;assert.ok(d.post.archived_at);assert.equal(d.archive_history.length,1);
  assert.equal((await db.query(`select count(*) from public.members where post_id='${post}'`)).rows[0].count,before);
  assert.equal((await db.query(`select public.cvoa_public_campaign('${slug}') as d`)).rows[0].d,null);
  await db.exec('savepoint checkout_attempt;set local role service_role');
  await assert.rejects(db.query(`select public.cvoa_campaign_request('${slug}',100,'${uid(9042)}')`),/not accepting donations/);
  await db.exec('rollback to savepoint checkout_attempt;set local role authenticated');
  await db.exec(`select public.cvoa_post_archive('${post}',false,'Return to active operations')`);
  const restored=(await db.query(`select public.cvoa_post_dashboard('${post}') as d`)).rows[0].d;assert.equal(restored.post.archived_at,null);assert.equal(restored.archive_history.length,2);
 });
});
test('Operational health settings are National-only, validated, audited and protected against stale saves',async()=>{
 await as(officer,async()=>{await assert.rejects(db.query(`select public.cvoa_save_health_policy(1,'{}','Policy review')`),/National policy administration required/)});
 await as(national,async()=>{
  const current=(await db.query(`select settings,version from public.post_health_policy where id`)).rows[0];
  await db.query('select public.cvoa_save_health_policy($1,$2,$3)',[current.version,JSON.stringify({...current.settings,membership_green:50,membership_yellow:20,confirmed:true}),'Approved operational indicators']);
  const evidence=(await db.query(`select public.cvoa_post_health_evidence(array['${post}'::uuid]) as e`)).rows[0].e;assert.equal(evidence[post].policy.membership_green,50);
  assert.equal((await db.query(`select count(*)::int n from public.post_health_policy_history`)).rows[0].n,1);
  await db.exec('savepoint stale_policy');await assert.rejects(db.query('select public.cvoa_save_health_policy($1,$2,$3)',[current.version,JSON.stringify(current.settings),'Stale saved version']),/policy changed/);await db.exec('rollback to savepoint stale_policy');
  await db.exec('savepoint bad_policy');await assert.rejects(db.query('select public.cvoa_save_health_policy($1,$2,$3)',[current.version+1,JSON.stringify({...current.settings,meeting_green_days:60,meeting_yellow_days:30}),'Invalid reversed thresholds']),/Yellow thresholds/);await db.exec('rollback to savepoint bad_policy');
 });
});
