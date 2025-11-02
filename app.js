const DEFAULT_MORPHS = [
  { id: "minecraft:zombie", label: "Zombie" },
  { id: "minecraft:creeper", label: "Creeper" },
  { id: "minecraft:skeleton", label: "Skeleton" },
  { id: "minecraft:spider", label: "Spider" },
  { id: "minecraft:enderman", label: "Enderman" },
  { id: "minecraft:slime", label: "Slime" },
  { id: "minecraft:witch", label: "Witch" },
  { id: "minecraft:villager", label: "Villager" }
];

const state = {
  customs: [],
};

function renderDefaultMorphs() {
  const grid = document.getElementById("default-morphs");
  grid.innerHTML = "";
  DEFAULT_MORPHS.forEach((m, idx) => {
    const id = `morph-${idx}`;
    const item = document.createElement("label");
    item.className = "morph-item";
    item.innerHTML = `<input type="checkbox" id="${id}" checked /> <span><strong>${m.label}</strong><br/><small>${m.id}</small></span>`;
    grid.appendChild(item);
  });
}

function hookCustoms() {
  const addBtn = document.getElementById("add-custom");
  const idInput = document.getElementById("custom-id");
  const labelInput = document.getElementById("custom-label");
  const list = document.getElementById("custom-list");
  const render = () => {
    list.innerHTML = "";
    state.customs.forEach((c, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${c.label} <small style="color:#64748b">(${c.id})</small></span><button aria-label="Remove">?</button>`;
      li.querySelector("button").onclick = () => { state.customs.splice(i,1); render(); };
      list.appendChild(li);
    });
  };
  addBtn.onclick = () => {
    const id = idInput.value.trim();
    const label = labelInput.value.trim() || id;
    if (!id || !id.includes(":")) { alert("Enter a valid entity id like minecraft:zombie"); return; }
    state.customs.push({ id, label });
    idInput.value = ""; labelInput.value = ""; render();
  };
  render();
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return await res.text();
}

function materializeServerScript(template, morphs) {
  const json = JSON.stringify(morphs, null, 2);
  return template.replace("__MORPH_LIST__", json);
}

async function generateMcAddon() {
  const selectedDefaults = [];
  const grid = document.getElementById("default-morphs");
  const inputs = Array.from(grid.querySelectorAll("input[type=checkbox]"));
  inputs.forEach((input, idx) => {
    if (input.checked) selectedDefaults.push(DEFAULT_MORPHS[idx]);
  });
  const morphs = [...selectedDefaults, ...state.customs];
  if (morphs.length === 0) { alert("Select or add at least one mob"); return; }

  const zip = new JSZip();
  const root = zip.folder("MorphAddon");

  // Template files
  const files = [
    { from: "/addon_template/behavior_packs/morph_bp/manifest.json", to: "behavior_packs/morph_bp/manifest.json" },
    { from: "/addon_template/behavior_packs/morph_bp/scripts/server.js", to: "behavior_packs/morph_bp/scripts/server.js", transform: (t)=>materializeServerScript(t, morphs) },
    { from: "/addon_template/resource_packs/morph_rp/manifest.json", to: "resource_packs/morph_rp/manifest.json" },
    { from: "/addon_template/resource_packs/morph_rp/texts/en_US.lang", to: "resource_packs/morph_rp/texts/en_US.lang" },
  ];

  for (const f of files) {
    const text = await fetchText(f.from);
    const out = f.transform ? f.transform(text) : text;
    root.file(f.to, out);
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  saveAs(blob, "morph_addon.mcaddon");
}

function init() {
  renderDefaultMorphs();
  hookCustoms();
  document.getElementById("generate").onclick = () => {
    generateMcAddon().catch(err => {
      console.error(err);
      alert("Generation failed: " + err.message);
    });
  };
}

document.addEventListener("DOMContentLoaded", init);
