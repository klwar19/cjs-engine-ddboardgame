import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { CampaignBridgeBanner } from "./CampaignBridgeBanner";
import { HelpPopover } from "./HelpPopover";
import { PhaseStrip } from "./PhaseStrip";
import { CombatScreen } from "./components/CombatScreen";
import {
  activateCombat,
  attachCombatSubscriptions,
  detachCombatSubscriptions,
  prepareCombat,
  teardownCombat
} from "./combatLifecycle";
import {
  getCombatCjs,
  type CampaignRequest,
  type CombatResult,
  type CombatState
} from "./types";

interface EncounterRecord {
  readonly id?: string;
  readonly name?: string;
  readonly _runtime?: boolean;
  readonly _scope?: string;
  readonly world?: string;
  readonly setting?: string;
}

function isRuntimeEncounter(encounter: EncounterRecord | null | undefined) {
  if (!encounter) return false;
  return !!(encounter._runtime || encounter._scope === "runtime");
}

function isCampaignBattleMode(): boolean {
  return (
    new URLSearchParams(window.location.search).get("campaignBattle") === "1"
  );
}

function pickGridThemeImage(
  request: CampaignRequest | null,
  encounter: EncounterRecord | null
): string {
  const world = String(request?.world ?? encounter?.world ?? "").toLowerCase();
  const setting = String(
    request?.setting ?? encounter?.setting ?? ""
  ).toLowerCase();
  if (
    world.includes("haven") ||
    setting.includes("haven") ||
    setting.includes("frost")
  ) {
    return "images/story-mode/haven/frostwood-vn.png";
  }
  if (
    world.includes("zombie") ||
    world.includes("rot") ||
    setting.includes("zombie") ||
    setting.includes("rot") ||
    setting.includes("city")
  ) {
    return "images/story-mode/zombie/rot-city-vn.webp";
  }
  return "";
}

function createDemoEncounter() {
  const cjs = getCombatCjs();
  const DS = cjs.DataStore;
  if (!DS) return;

  const characters = DS.getAll("characters") ?? {};
  if (Object.keys(characters).length === 0) {
    DS.replace("characters", "bin", {
      id: "bin",
      name: "Bin Chen",
      icon: "B",
      team: "player",
      rank: "F",
      type: "humanoid",
      stats: { S: 5, P: 6, E: 5, C: 8, I: 7, A: 6, L: 5 },
      skills: [],
      equipment: [],
      innatePassives: [],
      movement: 3
    });
    DS.replace("characters", "bowy", {
      id: "bowy",
      name: "Bowy",
      icon: "W",
      team: "player",
      rank: "F",
      type: "humanoid",
      stats: { S: 7, P: 7, E: 6, C: 4, I: 4, A: 5, L: 5 },
      skills: [],
      equipment: [],
      innatePassives: [],
      movement: 3
    });
  }

  const monsters = DS.getAll("monsters") ?? {};
  if (Object.keys(monsters).length === 0) {
    DS.replace("monsters", "ice_wolf", {
      id: "ice_wolf",
      name: "Ice Wolf",
      icon: "W",
      team: "enemy",
      rank: "F",
      type: "beast",
      stats: { S: 6, P: 5, E: 4, C: 2, I: 3, A: 7, L: 3 },
      skills: [],
      equipment: [],
      innatePassives: [],
      movement: 4,
      loot: [],
      aiRules: [
        {
          priority: 1,
          condition: "any_adjacent_enemy",
          action: "attack",
          target: "lowest_hp"
        },
        {
          priority: 2,
          condition: "default",
          action: "move_toward",
          target: "nearest_enemy"
        }
      ]
    });
    DS.replace("monsters", "frost_goblin", {
      id: "frost_goblin",
      name: "Frost Goblin",
      icon: "G",
      team: "enemy",
      rank: "F",
      type: "humanoid",
      stats: { S: 4, P: 4, E: 3, C: 3, I: 5, A: 5, L: 4 },
      skills: [],
      equipment: [],
      innatePassives: [],
      movement: 3,
      loot: [],
      aiRules: [
        {
          priority: 1,
          condition: "default",
          action: "attack",
          target: "nearest_enemy"
        }
      ]
    });
  }

  const grid: string[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => "empty")
  );
  grid[2][3] = "obstacle";
  grid[5][4] = "obstacle";
  grid[3][6] = "fire_zone";
  grid[4][1] = "ice_zone";

  DS.replace("encounters", "demo_frostwood", {
    id: "demo_frostwood",
    name: "Frostwood Patrol (Demo)",
    width: 8,
    height: 8,
    grid,
    units: [
      { id: "bin", pos: [6, 1], size: "1x1" },
      { id: "bowy", pos: [6, 3], size: "1x1" },
      { id: "ice_wolf", pos: [1, 2], size: "1x1" },
      { id: "frost_goblin", pos: [1, 5], size: "1x1" }
    ]
  });
}

interface EncounterOption {
  readonly id: string;
  readonly label: string;
}

export function CombatPage() {
  const setupRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [bootReady, setBootReady] = useState(false);
  const [encounterOptions, setEncounterOptions] = useState<readonly EncounterOption[]>(
    []
  );
  const [selectedEncounter, setSelectedEncounter] = useState<string>("");
  const [showCombatView, setShowCombatView] = useState<boolean>(false);
  const [campaignRequest, setCampaignRequest] =
    useState<CampaignRequest | null>(null);
  const [campaignResult, setCampaignResult] = useState<CombatResult | null>(null);
  const [themeImage, setThemeImage] = useState<string>("");

  const battleSetupReadyRef = useRef(false);
  const demoCreatedRef = useRef(false);
  const activeEncounterIdRef = useRef<string | null>(null);
  const lastEncounterIdRef = useRef<string | null>(null);
  const campaignRequestRef = useRef<CampaignRequest | null>(null);
  const campaignResultWrittenRef = useRef(false);
  const campaignReturnTimerRef = useRef<number | null>(null);
  const campaignResultPollRef = useRef<number | null>(null);
  const unsubCampaignResultRef = useRef<(() => void) | null>(null);
  // Set to true after CombatManager.startEncounter has returned and the
  // CombatScreen has mounted; the post-mount effect then activates the
  // engine (subscribe, narrator, BGM, runUntilInput).
  const [pendingActivation, setPendingActivation] = useState(false);

  const removeRuntimeEncounter = useCallback((encounterId: string | null) => {
    if (!encounterId) return;
    const cjs = getCombatCjs();
    const DS = cjs.DataStore;
    if (!DS) return;
    const encounter = DS.get<EncounterRecord>("encounters", encounterId);
    if (isRuntimeEncounter(encounter)) {
      DS.remove("encounters", encounterId);
    }
  }, []);

  const teardownCombatView = useCallback(
    (opts: { removeActiveRuntime?: boolean } = {}) => {
      const removeActiveRuntime = opts.removeActiveRuntime !== false;

      if (unsubCampaignResultRef.current) {
        try {
          unsubCampaignResultRef.current();
        } catch {
          /* ignore */
        }
        unsubCampaignResultRef.current = null;
      }
      if (campaignResultPollRef.current != null) {
        clearInterval(campaignResultPollRef.current);
        campaignResultPollRef.current = null;
      }

      teardownCombat();
      setShowCombatView(false);

      if (removeActiveRuntime) {
        removeRuntimeEncounter(activeEncounterIdRef.current);
        activeEncounterIdRef.current = null;
      }
    },
    [removeRuntimeEncounter]
  );

  const populateEncounters = useCallback(() => {
    const cjs = getCombatCjs();
    const DS = cjs.DataStore;
    if (!DS) {
      setEncounterOptions([]);
      return;
    }
    const encounters = DS.getAll<EncounterRecord>("encounters") ?? {};
    const visible = Object.entries(encounters)
      .filter(([, enc]) => !isRuntimeEncounter(enc))
      .sort(([, a], [, b]) =>
        String(a?.name ?? a?.id ?? "").localeCompare(
          String(b?.name ?? b?.id ?? "")
        )
      );

    if (visible.length === 0 && !demoCreatedRef.current) {
      demoCreatedRef.current = true;
      createDemoEncounter();
      const refreshed = DS.getAll<EncounterRecord>("encounters") ?? {};
      const next = Object.entries(refreshed)
        .filter(([, enc]) => !isRuntimeEncounter(enc))
        .sort(([, a], [, b]) =>
          String(a?.name ?? a?.id ?? "").localeCompare(
            String(b?.name ?? b?.id ?? "")
          )
        );
      setEncounterOptions(
        next.map(([id, enc]) => ({ id, label: enc.name ?? id }))
      );
      return;
    }

    setEncounterOptions(
      visible.map(([id, enc]) => ({ id, label: enc.name ?? id }))
    );
  }, []);

  const campaignReturnUrl = useCallback(() => {
    const fallback =
      campaignRequestRef.current?.returnUrl ?? "campaign.html?combatReturn=1";
    try {
      const url = new URL(fallback, window.location.href);
      url.searchParams.set("combatReturn", "1");
      if (campaignResultWrittenRef.current) {
        url.searchParams.set("combatResult", "1");
      }
      url.searchParams.set("t", String(Date.now()));
      return url.href;
    } catch {
      return fallback;
    }
  }, []);

  const writeCampaignResultFromState = useCallback(
    (state: CombatState | null | undefined) => {
      const cjs = getCombatCjs();
      const Bridge = cjs.CampaignCombatBridge;
      const req = campaignRequestRef.current;
      if (!Bridge || !req || !state) return false;
      const stateLike = state as { phase?: string };
      if (stateLike.phase !== "battle_end") return false;
      if (campaignResultWrittenRef.current) return true;
      const result = Bridge.buildResultFromCombat(req, state);
      Bridge.writeResult(result);
      Bridge.clearRequest();
      campaignResultWrittenRef.current = true;
      setCampaignResult(result);
      if (!campaignReturnTimerRef.current) {
        campaignReturnTimerRef.current = window.setTimeout(() => {
          returnToCampaign();
        }, 1400);
      }
      return true;
    },
    // returnToCampaign defined below in same component; using ref-based deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const flushCampaignResult = useCallback(() => {
    if (!campaignRequestRef.current) return false;
    if (campaignResultWrittenRef.current) return true;
    const cjs = getCombatCjs();
    const state = cjs.CombatManager?.getState?.();
    return writeCampaignResultFromState(state);
  }, [writeCampaignResultFromState]);

  const returnToCampaign = useCallback(() => {
    flushCampaignResult();
    const targetUrl = campaignReturnUrl();
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
        window.opener.location.href = targetUrl;
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 250);
        return;
      } catch {
        /* ignore */
      }
    }
    window.location.href = targetUrl;
  }, [campaignReturnUrl, flushCampaignResult]);

  const bindCampaignResult = useCallback(() => {
    const cjs = getCombatCjs();
    if (!campaignRequestRef.current || unsubCampaignResultRef.current) return;
    if (cjs.CombatManager?.subscribe) {
      unsubCampaignResultRef.current = cjs.CombatManager.subscribe((state) => {
        writeCampaignResultFromState(state);
      });
    }
    writeCampaignResultFromState(cjs.CombatManager?.getState?.());
    campaignResultPollRef.current = window.setInterval(() => {
      if (flushCampaignResult() && campaignResultPollRef.current != null) {
        clearInterval(campaignResultPollRef.current);
        campaignResultPollRef.current = null;
      }
    }, 400);
  }, [flushCampaignResult, writeCampaignResultFromState]);

  const ensureBattleSetup = useCallback(() => {
    if (battleSetupReadyRef.current) return;
    const cjs = getCombatCjs();
    const BS = cjs.BattleSetup;
    const el = setupRef.current;
    if (!BS || !el) return;
    BS.init(el, (encId: string) => {
      void startCombat(encId);
    });
    battleSetupReadyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSetup = useCallback(
    (opts: { resetSetup?: boolean } = {}) => {
      teardownCombatView();
      ensureBattleSetup();
      const cjs = getCombatCjs();
      const BS = cjs.BattleSetup;
      if (!BS) return;
      const el = setupRef.current;
      if (el) el.style.display = "";
      if (opts.resetSetup) {
        BS.reset();
      } else {
        BS.show();
      }
    },
    [ensureBattleSetup, teardownCombatView]
  );

  const startCombat = useCallback(
    (encounterId: string) => {
      if (!encounterId) {
        alert("Select an encounter first.");
        return;
      }
      const cjs = getCombatCjs();
      const DS = cjs.DataStore;
      if (!DS) return;
      const encounter = DS.get<EncounterRecord>("encounters", encounterId);
      if (!encounter) {
        alert(`Encounter not found: ${encounterId}`);
        return;
      }

      teardownCombatView();
      prepareCombat();

      const settings = cjs.CombatSettings;
      if (settings) {
        settings.reset?.();
        settings.setTeamControl?.("player", "manual");
        settings.setTeamControl?.("enemy", "ai");
      }

      const setupEl = setupRef.current;
      if (setupEl) setupEl.style.display = "none";

      activeEncounterIdRef.current = encounterId;
      lastEncounterIdRef.current = encounterId;
      setThemeImage(pickGridThemeImage(campaignRequestRef.current, encounter));
      setShowCombatView(true);

      try {
        cjs.CombatManager?.startEncounter?.(encounterId);
        // Defer activateCombat until <CombatScreen /> has mounted (and
        // CombatGrid's useEffect has initialised the GridRenderer). A
        // post-render effect picks up `pendingActivation` and runs
        // activateCombat exactly once.
        setPendingActivation(true);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Combat start failed:", error);
        alert(`Combat failed to start: ${msg}`);
        setShowCombatView(false);
        showSetup();
      }
    },
    [bindCampaignResult, showSetup, teardownCombatView]
  );

  const restartCombat = useCallback(() => {
    if (!lastEncounterIdRef.current) return;
    startCombat(lastEncounterIdRef.current);
  }, [startCombat]);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      const cjs = getCombatCjs();
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        teardownCombatView();
        cjs.DataStore?.loadData(data);
        const quips = cjs.DataStore?.getAllAsArray("quips") ?? [];
        if (cjs.NarratorData) await cjs.NarratorData.load(quips);
        populateEncounters();
        ensureBattleSetup();
        showSetup({ resetSetup: true });
        console.log("Data imported successfully.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Import failed: ${msg}`);
      } finally {
        input.value = "";
      }
    },
    [ensureBattleSetup, populateEncounters, showSetup, teardownCombatView]
  );

  // Attach store to engine subscriptions once on first mount.
  useEffect(() => {
    attachCombatSubscriptions();
    return () => {
      detachCombatSubscriptions();
    };
  }, []);

  // Run activateCombat AFTER the CombatScreen has mounted and the grid
  // renderer is initialised. This effect fires when both showCombatView
  // and pendingActivation flip true; it runs once and clears the flag.
  useEffect(() => {
    if (!showCombatView || !pendingActivation) return;
    activateCombat();
    bindCampaignResult();
    setPendingActivation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCombatView, pendingActivation]);

  // Boot: wait until the vanilla CJS modules have self-registered before
  // bootstrapping data + setup. Matches the original DOMContentLoaded IIFE.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      const cjs = getCombatCjs();
      const ready = !!(
        cjs.DataStore &&
        cjs.NarratorData &&
        cjs.ContentManager &&
        cjs.BattleSetup &&
        cjs.CampaignCombatBridge &&
        cjs.CombatManager
      );
      if (!ready) {
        tries += 1;
        if (tries > 100) {
          console.warn("Combat: CJS modules never finished initialising");
          return;
        }
        window.setTimeout(() => void tick(), 40);
        return;
      }

      try {
        const result = await cjs.ContentManager!.loadDefaultData();
        await cjs.NarratorData!.load(cjs.DataStore!.getAllAsArray("quips"));
        console.log(
          "Combat data loaded:",
          result.mode,
          cjs.DataStore!.getCounts?.()
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn("Combat load error:", msg);
      }

      if (cjs.PortraitPicker?.loadManifest) {
        await cjs.PortraitPicker.loadManifest().catch(() => undefined);
      }
      cjs.ScenePlayer?.wireCombat?.();
      if (cjs.L2DCompanion?.init) {
        cjs.L2DCompanion
          .init({ mode: "combat" })
          .catch((err: unknown) => console.warn("L2D init:", err));
      }

      if (cancelled) return;

      populateEncounters();
      ensureBattleSetup();
      setBootReady(true);

      if (isCampaignBattleMode()) {
        const Bridge = cjs.CampaignCombatBridge!;
        const req = Bridge.readRequest();
        campaignRequestRef.current = req;
        setCampaignRequest(req);
        const runtimeId = Bridge.createRuntimeEncounterFromRequest(req);
        if (runtimeId) {
          startCombat(runtimeId);
        } else {
          showSetup();
          alert("Campaign battle request was missing or could not be loaded.");
        }
      } else {
        showSetup();
      }
      console.log("CJS Combat Simulator ready.");
    };
    void tick();
    return () => {
      cancelled = true;
    };
    // We deliberately want this effect to run only once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pagehide / beforeunload: flush a campaign result if we've already finished
  // but the user is leaving before the auto-return timer fires.
  useEffect(() => {
    const onLeave = () => {
      flushCampaignResult();
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [flushCampaignResult]);

  // Clean up any timers that survived the React lifetime.
  useEffect(() => {
    return () => {
      if (campaignReturnTimerRef.current != null) {
        clearTimeout(campaignReturnTimerRef.current);
        campaignReturnTimerRef.current = null;
      }
      if (campaignResultPollRef.current != null) {
        clearInterval(campaignResultPollRef.current);
        campaignResultPollRef.current = null;
      }
      if (unsubCampaignResultRef.current) {
        try {
          unsubCampaignResultRef.current();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const encounterSelectOptions = useMemo(
    () => [
      { id: "", label: "-- Start Existing Encounter --" },
      ...encounterOptions
    ],
    [encounterOptions]
  );

  return (
    <>
      <div id="combat-app">
        <header className="combat-header">
          <a href="index.html" className="back-link cjs-embed-hide">
            Main Menu
          </a>
          <h1>CJS Combat Simulator</h1>
          <div className="header-controls">
            <button
              id="btn-battle-setup"
              className="btn btn-primary"
              onClick={() => showSetup()}
            >
              Battle Setup
            </button>
            <span className="header-divider">|</span>
            <select
              id="encounter-select"
              value={selectedEncounter}
              onChange={(e) => setSelectedEncounter(e.currentTarget.value)}
            >
              {encounterSelectOptions.map((opt) => (
                <option key={opt.id || "__placeholder"} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              id="btn-start"
              className="btn"
              onClick={() => startCombat(selectedEncounter)}
              disabled={!bootReady}
            >
              Start Encounter
            </button>
            <button id="btn-import" className="btn" onClick={handleImportClick}>
              Import Data
            </button>
            <input
              ref={importInputRef}
              type="file"
              id="file-import"
              accept=".json"
              style={{ display: "none" }}
              onChange={(e) => void handleImportChange(e)}
            />
          </div>
        </header>

        <PhaseStrip combatVisible={showCombatView} />

        <main
          id="battle-setup-container"
          ref={setupRef}
          style={{ display: showCombatView ? "none" : undefined }}
        />
        {showCombatView && campaignRequest ? (
          <CampaignBridgeBanner
            request={campaignRequest}
            result={campaignResult}
            onReturn={returnToCampaign}
          />
        ) : null}
        <main
          id="combat-container"
          style={{ display: showCombatView ? "" : "none" }}
        >
          {showCombatView ? (
            <CombatScreen
              themeImage={themeImage}
              onReturnToSetup={
                campaignRequest
                  ? returnToCampaign
                  : () => showSetup()
              }
              onRestart={restartCombat}
            />
          ) : null}
        </main>
      </div>

      <HelpPopover title="Combat Quick Guide" />
    </>
  );
}
