"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useAccount } from "../app/components/AccountGate";
import { Dataset, emptyDataset } from "./dataset";
import { readCloudRow, loadCloudDataset, saveCloudDataset } from "./cloud";
export function useCloudWorkspace() {
  const { client, user } = useAccount();
  const [data, setData] = useState<Dataset>(emptyDataset),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [remoteStatus, setRemoteStatus] = useState("draft");
  const latest = useRef(data),
    saved = useRef<Dataset | null>(null),
    revision = useRef<number | null | undefined>(undefined),
    running = useRef<Promise<void> | null>(null),
    blocked = useRef(false),
    alive = useRef(true),
    canSave = useRef(false);
  const dirty = data !== saved.current && ready;
  const report = useCallback((e: unknown) => {
    const text = e instanceof Error ? e.message : "";
    setError(
      [
        "Limite bêta : 100 photos par collection.",
        "Une photo dépasse 15 Mo.",
        "La sauvegarde en ligne accepte JPEG, PNG et WebP. Convertissez les autres formats.",
        "Une autre version existe en ligne. Rechargez-la avant de sauvegarder.",
      ].includes(text)
        ? text
        : "Sauvegarde impossible. Vos changements ne sont pas encore enregistrés en ligne.",
    );
    blocked.current = true;
  }, []);
  const update: Dispatch<SetStateAction<Dataset>> = useCallback((value) => {
    if (!canSave.current) return;
    const next = typeof value === "function" ? value(latest.current) : value;
    latest.current = next;
    setData(next);
  }, []);
  const read = useCallback(
    async (isLive: () => boolean) => {
      if (!client || !user) throw new Error("Authentication required");
      const row = await readCloudRow(client, user.id);
      const value = row
        ? await loadCloudDataset(client, row)
        : { ...emptyDataset, birds: [], photos: [] };
      if (!isLive()) return;
      revision.current = row?.revision ?? null;
      saved.current = value;
      latest.current = value;
      blocked.current = false;
      canSave.current = true;
      setData(value);
      setError("");
      setRemoteStatus(row?.status ?? "draft");
      setReady(true);
    },
    [client, user?.id],
  );
  useEffect(() => {
    alive.current = true;
    let live = true;
    void read(() => live).catch((e) => {
      if (live) report(e);
    });
    return () => {
      live = false;
      alive.current = false;
      canSave.current = false;
    };
  }, [read, report]);
  const flush = useCallback(async (): Promise<void> => {
    while (running.current) await running.current;
    if (!canSave.current) return;
    if (!client || !user || revision.current === undefined)
      throw new Error("Collection non chargée.");
    blocked.current = false;
    setError("");
    if (latest.current === saved.current) return;
    setSaving(true);
    const work = Promise.resolve().then(async () => {
      try {
        while (alive.current && latest.current !== saved.current) {
          const snapshot = latest.current;
          const row = await saveCloudDataset(
            client,
            user.id,
            snapshot,
            revision.current!,
          );
          if (!alive.current) return;
          revision.current = row.revision;
          saved.current = snapshot;
          setRemoteStatus(row.status);
        }
      } catch (e) {
        if (alive.current) report(e);
        throw e;
      } finally {
        running.current = null;
        if (alive.current) setSaving(false);
      }
    });
    running.current = work;
    return work;
  }, [client, user?.id, report]);
  useEffect(() => {
    if (!ready || !dirty || saving || blocked.current) return;
    const timer = setTimeout(() => {
      if (canSave.current && !blocked.current) void flush().catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [data, ready, dirty, saving, flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        !canSave.current ||
        (latest.current === saved.current && !running.current)
      )
        return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const reload = useCallback(async () => {
    if (running.current) return;
    const wasReady = canSave.current;
    canSave.current = false;
    setReady(false);
    setError("");
    try {
      await read(() => alive.current);
    } catch (e) {
      if (alive.current) {
        canSave.current = wasReady;
        setReady(wasReady);
        report(e);
      }
    }
  }, [read, report]);
  const submit = useCallback(async () => {
    await flush();
    if (!client || !latest.current.consent || !latest.current.photos.length)
      throw new Error("Consent required");
    setSaving(true);
    const task = Promise.resolve().then(async () => {
      try {
        const { data, error } = await client.rpc("submit_dataset", {
          expected_revision: revision.current,
        });
        if (error) throw error;
        if (alive.current) {
          revision.current = Number(data);
          setRemoteStatus("submitted");
        }
      } catch (e) {
        if (alive.current) report(e);
        throw e;
      } finally {
        running.current = null;
        if (alive.current) setSaving(false);
      }
    });
    running.current = task;
    return task;
  }, [client, flush, report]);
  return {
    current: () => latest.current,
    data,
    update,
    ready,
    saving,
    dirty,
    error,
    flush,
    reload,
    submit,
    remoteStatus,
  };
}
export type CloudWorkspace = ReturnType<typeof useCloudWorkspace>;
