import { world, system, MinecraftEffectTypes, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// Will be replaced by the generator
const MORPHS = __MORPH_LIST__;

const TICK_MS = 50;
const morphByPlayerId = new Map();
const cooldowns = new Map();

function now() { return Date.now(); }
function setCooldown(playerId, key, ms) {
  if (!cooldowns.has(playerId)) cooldowns.set(playerId, new Map());
  cooldowns.get(playerId).set(key, now() + ms);
}
function canUse(playerId, key) {
  const m = cooldowns.get(playerId);
  if (!m) return true;
  const t = m.get(key);
  return !t || t < now();
}

function showMorphMenu(player) {
  const form = new ActionFormData();
  form.title("Morph Selector");
  MORPHS.forEach(m => form.button(m.label));
  form.show(player).then(res => {
    if (res.canceled) return;
    const choice = MORPHS[res.selection];
    if (choice) applyMorph(player, choice);
  }).catch(() => {});
}

function clearMorph(player) {
  const rec = morphByPlayerId.get(player.id);
  if (rec && rec.entity && rec.entity.isValid()) {
    try { rec.entity.remove(); } catch {}
  }
  morphByPlayerId.delete(player.id);
  try { player.removeEffect(MinecraftEffectTypes.invisibility); } catch {}
}

function applyMorph(player, morph) {
  clearMorph(player);

  try {
    player.addEffect(MinecraftEffectTypes.invisibility, 20 * 60 * 60, { amplifier: 1, showParticles: false });
  } catch {}

  const dim = player.dimension;
  const pos = player.location;
  const entity = dim.spawnEntity(morph.id, pos);
  entity.addTag(`morph_owner:${player.id}`);
  morphByPlayerId.set(player.id, { entity, typeId: morph.id, label: morph.label });
}

world.beforeEvents.itemUse.subscribe(ev => {
  try {
    const player = ev.source;
    if (!player || player.typeId !== "minecraft:player") return;
    const item = ev.itemStack;
    if (!item) return;
    if (item.typeId === "minecraft:clock") {
      ev.cancel = true;
      if (canUse(player.id, "menu")) {
        setCooldown(player.id, "menu", 500);
        showMorphMenu(player);
      }
    }
  } catch {}
});

world.afterEvents.playerLeave.subscribe(ev => {
  // Clean up morph entities on leave if they persist
  const id = ev.playerId;
  const rec = morphByPlayerId.get(id);
  if (rec && rec.entity && rec.entity.isValid()) {
    try { rec.entity.remove(); } catch {}
  }
  morphByPlayerId.delete(id);
});

// Simple ability helpers
function handleAbilities(player, rec) {
  if (!rec || !rec.entity || !rec.entity.isValid()) return;
  const typeId = rec.typeId;

  // Creeper: sneak to explode (small, no block damage)
  if (typeId === "minecraft:creeper") {
    if (player.isSneaking && canUse(player.id, "creeper_boom")) {
      setCooldown(player.id, "creeper_boom", 4000);
      try { player.dimension.createExplosion(player.location, 2.5, { breaksBlocks: false, causesFire: false, source: player }); } catch {}
    }
  }

  // Skeleton: ensure a bow in inventory
  if (typeId === "minecraft:skeleton") {
    try {
      const inv = player.getComponent("minecraft:inventory");
      const cont = inv?.container;
      let hasBow = false;
      for (let i = 0; i < cont.size; i++) {
        const it = cont.getItem(i);
        if (it && it.typeId === "minecraft:bow") { hasBow = true; break; }
      }
      if (!hasBow && canUse(player.id, "skeleton_bow")) {
        setCooldown(player.id, "skeleton_bow", 3000);
        cont.addItem(new ItemStack("minecraft:bow", 1));
        cont.addItem(new ItemStack("minecraft:arrow", 64));
      }
    } catch {}
  }

  // Spider: jump boost when sneaking
  if (typeId === "minecraft:spider") {
    try { player.addEffect(MinecraftEffectTypes.jumpBoost, 40, { amplifier: 2, showParticles: false }); } catch {}
  }

  // Zombie: resistance + strength
  if (typeId === "minecraft:zombie") {
    try {
      player.addEffect(MinecraftEffectTypes.resistance, 40, { amplifier: 1, showParticles: false });
      player.addEffect(MinecraftEffectTypes.strength, 40, { amplifier: 1, showParticles: false });
    } catch {}
  }
}

// Sync loop: keep morphed entity on player position and facing
system.runInterval(() => {
  try {
    for (const player of world.getAllPlayers()) {
      const rec = morphByPlayerId.get(player.id);
      if (!rec) continue;
      if (!rec.entity || !rec.entity.isValid()) { morphByPlayerId.delete(player.id); continue; }

      const p = player.location;
      const r = player.getRotation();
      try { rec.entity.teleport(p, { facingLocation: { x: p.x + Math.cos((r.yaw ?? 0) * Math.PI / 180), y: p.y, z: p.z + Math.sin((r.yaw ?? 0) * Math.PI / 180) } }); } catch {}

      handleAbilities(player, rec);
    }
  } catch {}
}, 1);
