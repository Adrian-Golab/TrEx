// ========== CSV Loading ==========
async function loadCSV(file) {
  if (file.endsWith(".gz")) {
    // If it's gzipped, fetch + decompress first
    const response = await fetch(file);
    const arrayBuffer = await response.arrayBuffer();

    // Decompress using pako
    const compressed = new Uint8Array(arrayBuffer);
    const decompressed = pako.ungzip(compressed, { to: "string" });

    // Parse CSV text with Papa
    return new Promise((resolve, reject) => {
      Papa.parse(decompressed, {
        header: true,
        dynamicTyping: false,
        complete: (res) => resolve(res.data),
        error: (err) => reject(err),
      });
    });
  } else {
    // Normal CSV: let Papa handle it directly
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        download: true,
        header: true,
        dynamicTyping: false,
        complete: (res) => resolve(res.data),
        error: (err) => reject(err),
      });
    });
  }
}


// ========== Helpers ==========
function splitMulti(val) {
  if (!val) return [];
  return val.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
}

function diseaseMatch(rowDisease, selected) {
  if (!rowDisease || !selected) return false;
  return rowDisease.trim().toLowerCase() === selected.trim().toLowerCase();
}

// Create a global color map so the same label always has the same color
const colorMap = {};
let colorIndex = 0;

function getColorForLabel(label) {
  if (!colorMap[label]) {
    colorMap[label] = chartColors[colorIndex % chartColors.length];
    colorIndex++;
  }
  return colorMap[label];
}

function setPie(chart, counts) {
  if (!chart) return;
  const labels = Object.keys(counts);
  chart.data.labels = labels;
  chart.data.datasets[0].data = labels.map(l => counts[l]);
  chart.data.datasets[0].backgroundColor = labels.map(l => getColorForLabel(l));
  chart.update();
}

function createPieChart(canvas, title) {
  if (!canvas) {
    console.error("Canvas not found for chart:", title);
    return null;
  }
  return new Chart(canvas, {
    type: "pie",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "right",
          labels: {
            filter: (legendItem, data) => legendItem.index < 10
          }
        },
        title: { display: true, text: title },
      },
    },
  });
}

// ========== Globals ==========
let ct, pdi, cdi, drugs, pubmed;
let chCT, chPub, chPhases, chPubTypes, chInterventions,
    chCTTopDrugs, chPubTopDrugs;
let allDiseases = [];

const chartColors = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#aec7e8", "#ffbb78", "#98df8a", "#ff9896"
];

// ========== Main Refresh ==========
function refreshAll() {
  const disease = document.getElementById("diseaseSearch").value.trim();
  const includePubmed = document.getElementById("includePubmed").checked;
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  // Currently unused — date filtering will be added later

  if (!disease) return;

  // --- Intervention Types ---
  const interventionCounts = {};
  ct.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
    splitMulti(row["Intervention Types"]).forEach(t => {
      if (t) interventionCounts[t] = (interventionCounts[t] || 0) + 1;
    });
  });
  setPie(chInterventions, interventionCounts);

  // --- CT Categorized Drugs ---
  const ctCats = {};
  cdi.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
    const drug = row["Drug Name"];
    const cat = drugs.find(d => d["Drug Name"] === drug)?.["ATC 1st Level"] || "Unknown";
    ctCats[cat] = (ctCats[cat] || 0) + 1;
  });
  setPie(chCT, ctCats);

  // --- PubMed Categorized Drugs ---
  if (includePubmed) {
    const pubCats = {};
    pdi.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
      const drug = row["Drug Name"];
      const cat = drugs.find(d => d["Drug Name"] === drug)?.["ATC 1st Level"] || "Unknown";
      pubCats[cat] = (pubCats[cat] || 0) + 1;
    });
    setPie(chPub, pubCats);
  } else if (chPub) {
    setPie(chPub, {});
  }

  // --- CT Phases ---
  const phaseCounts = {};
  ct.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
    splitMulti(row.Phases).forEach(p => {
      if (p) phaseCounts[p] = (phaseCounts[p] || 0) + 1;
    });
  });
  setPie(chPhases, phaseCounts);

  // --- PubMed by Publication Type ---
  if (includePubmed) {
    const typeCounts = {};
    const filtered = pubmed.filter(r => diseaseMatch(r.Disease, disease));
    console.log("Matching PubMed rows:", filtered.length, filtered.slice(0, 5));
    pubmed.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
      splitMulti(row.PublicationTypes).forEach(t => {
        if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
    });
    console.log("Publication type counts:", typeCounts);
    setPie(chPubTypes, typeCounts);
  } else if (chPubTypes) {
    setPie(chPubTypes, {});
  }
  

  // --- Top 10 CT Drugs ---
  const ctDrugCounts = {};
  cdi.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
    const drug = row["Drug Name"];
    ctDrugCounts[drug] = (ctDrugCounts[drug] || 0) + 1;
  });
  const topCT = Object.entries(ctDrugCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  setPie(chCTTopDrugs, Object.fromEntries(topCT));

  // --- Top 10 PubMed Drugs ---
  if (includePubmed) {
    const pubDrugCounts = {};
    pdi.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
      const drug = row["Drug Name"];
      pubDrugCounts[drug] = (pubDrugCounts[drug] || 0) + 1;
    });
    const topPub = Object.entries(pubDrugCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    setPie(chPubTopDrugs, Object.fromEntries(topPub));
  } else if (chPubTopDrugs) {
    setPie(chPubTopDrugs, {});
  }

  // --- Phase 3/4 Drugs List ---
  const phase34List = document.getElementById("phase34Drugs");
  phase34List.innerHTML = "";
  const ctPhase34 = new Set();

  ct.filter(r => diseaseMatch(r.Disease, disease)).forEach(row => {
    if (row.Phases && (row.Phases.includes("PHASE3") || row.Phases.includes("PHASE4"))) {
      const trialDrugs = cdi.filter(x => x["NCT ID"] === row["NCT ID"]);
      trialDrugs.forEach(dr => ctPhase34.add(dr["Drug Name"]));
    }
  });

  [...ctPhase34].sort().forEach(drug => {
    const li = document.createElement("li");
    li.textContent = drug;
    phase34List.appendChild(li);
  });

  // --- Recommended Drugs (Top 5) ---
  const recoBody = document.querySelector("#recoTable tbody");
  const recoNote = document.getElementById("recoNote");
  recoBody.innerHTML = "";
  recoNote.textContent = "";

  const selectedDrugs = new Set(
    cdi.filter(r => diseaseMatch(r.Disease, disease)).map(r => r["Drug Name"])
  );

  const diseaseToDrugs = new Map();
  cdi.forEach(r => {
    const d = r.Disease;
    const drug = r["Drug Name"];
    if (!d) return;
    if (!diseaseToDrugs.has(d)) diseaseToDrugs.set(d, new Set());
    diseaseToDrugs.get(d).add(drug);
  });

  const similarDiseases = [];
  for (const [d, set] of diseaseToDrugs.entries()) {
    if (diseaseMatch(d, disease)) continue;
    const hasOverlap = [...set].some(dr => selectedDrugs.has(dr));
    if (hasOverlap) similarDiseases.push(d);
  }

  const isSimilar = new Set(similarDiseases);
  const drugStats = {}; // drug -> { ncts: Set, diseases: Set }

  cdi.forEach(r => {
    if (!isSimilar.has(r.Disease)) return;
    const drug = r["Drug Name"];
    if (selectedDrugs.has(drug)) return;
    const nct = r["NCT ID"];
    const dis = r.Disease;
    if (!drugStats[drug]) drugStats[drug] = { ncts: new Set(), diseases: new Set() };
    drugStats[drug].ncts.add(nct);
    drugStats[drug].diseases.add(dis);
  });

  const recommendations = Object.entries(drugStats).map(([drug, stats]) => ({
    drug,
    count: stats.ncts.size,
    diseases: Array.from(stats.diseases).sort(),
    ncts: Array.from(stats.ncts).sort()
  })).sort((a, b) => b.count - a.count || a.drug.localeCompare(b.drug)).slice(0, 5);

  if (recommendations.length === 0) {
    if (selectedDrugs.size === 0) {
      recoNote.textContent = "No clinical-trial drugs found for this disease. Add CDI/CT data to generate recommendations.";
    } else if (similarDiseases.length === 0) {
      recoNote.textContent = "No other diseases share drugs with the selected disease.";
    } else {
      recoNote.textContent = "No candidate drugs found that are not already tested for the selected disease.";
    }
  } else {
    recommendations.forEach((rec, idx) => {
      const tr = document.createElement("tr");

      const rankTd = document.createElement("td");
      rankTd.textContent = idx + 1;

      const drugTd = document.createElement("td");
      drugTd.textContent = rec.drug;

      const countTd = document.createElement("td");
      countTd.textContent = rec.count;

      const examplesTd = document.createElement("td");
      examplesTd.innerHTML = `
        <div><strong>Diseases:</strong> ${rec.diseases.join(", ") || "—"}</div>
        <div><strong>NCTs:</strong> ${
          rec.ncts.length > 0
            ? rec.ncts.map(id => `<a href="https://clinicaltrials.gov/study/${id}" target="_blank">${id}</a>`).join(", ")
            : "—"
        }</div>
      `;

      tr.appendChild(rankTd);
      tr.appendChild(drugTd);
      tr.appendChild(countTd);
      tr.appendChild(examplesTd);
      recoBody.appendChild(tr);
    });
  }

  // --- Results Table ---
  const tbody = document.querySelector("#resultsTable tbody");
  tbody.innerHTML = "";
  const allRows = [];

  cdi.filter(r => diseaseMatch(r.Disease, disease)).forEach(r => {
    allRows.push({ id: r["NCT ID"], disease: r.Disease, drug: r["Drug Name"], type: "ct" });
  });

  if (includePubmed) {
    pdi.filter(r => diseaseMatch(r.Disease, disease)).forEach(r => {
      allRows.push({ id: r.PMID, disease: r.Disease, drug: r["Drug Name"], type: "pubmed" });
    });
  }

  allRows.forEach(r => {
    const tr = document.createElement("tr");

    const idCell = document.createElement("td");
    const link = document.createElement("a");
    if (r.type === "ct") {
      link.href = `https://clinicaltrials.gov/study/${r.id}`;
    } else if (r.type === "pubmed") {
      link.href = `https://pubmed.ncbi.nlm.nih.gov/${r.id}/`;
    }
    link.textContent = r.id;
    link.target = "_blank";
    idCell.appendChild(link);

    const diseaseCell = document.createElement("td");
    diseaseCell.textContent = r.disease;

    const drugCell = document.createElement("td");
    drugCell.textContent = r.drug;

    tr.appendChild(idCell);
    tr.appendChild(diseaseCell);
    tr.appendChild(drugCell);
    tbody.appendChild(tr);
  });

  const pubChart = document.getElementById("chartPubmed");
  const pubTypesChart = document.getElementById("chartPubTypes");
  const pubTopChart = document.getElementById("chartPubmedTopDrugs");
  if (pubChart) pubChart.parentElement.style.display = includePubmed ? "flex" : "none";
  if (pubTypesChart) pubTypesChart.parentElement.style.display = includePubmed ? "flex" : "none";
  if (pubTopChart) pubTopChart.parentElement.style.display = includePubmed ? "flex" : "none";
}

// ========== Init ==========
async function init() {
  [ct, pdi, cdi, drugs, pubmed] = await Promise.all([
    loadCSV("https://raw.githubusercontent.com/Adrian-Golab/TrEx/main/CT.csv"),
    loadCSV("https://raw.githubusercontent.com/Adrian-Golab/TrEx/main/PDI.csv"),
    loadCSV("https://raw.githubusercontent.com/Adrian-Golab/TrEx/main/CDI.csv"),
    loadCSV("https://raw.githubusercontent.com/Adrian-Golab/TrEx/main/Drugs.csv"),
    loadCSV("https://raw.githubusercontent.com/Adrian-Golab/TrEx/main/pubmed_small.csv.gz")
  ]);


  // Chart instances
  chInterventions = createPieChart(document.getElementById("chartInterventions"), "Clinical Trials by Intervention Type");
  chCT = createPieChart(document.getElementById("chartCT"), "CT Categorized Drugs");
  chPub = createPieChart(document.getElementById("chartPubmed"), "PubMed Categorized Drugs");
  chPhases = createPieChart(document.getElementById("chartPhases"), "Clinical Trials by Phase");
  chPubTypes = createPieChart(document.getElementById("chartPubTypes"), "PubMed by Publication Type");
  chCTTopDrugs = createPieChart(document.getElementById("chartCTTopDrugs"), "Top 10 CT Drugs");
  chPubTopDrugs = createPieChart(document.getElementById("chartPubmedTopDrugs"), "Top 10 PubMed Drugs");

  // Collect unique diseases
  allDiseases = Array.from(new Set([
    ...ct.map(r => r.Disease),
    ...pdi.map(r => r.Disease),
    ...cdi.map(r => r.Disease),
    ...pubmed.map(r => r.Disease)
  ])).filter(Boolean).sort();

  // Hook up search bar autocomplete
  const input = document.getElementById("diseaseSearch");
  const suggestionBox = document.createElement("div");
  suggestionBox.classList.add("autocomplete-suggestions");
  input.parentNode.appendChild(suggestionBox);

  input.addEventListener("input", () => {
    const val = input.value.toLowerCase();
    suggestionBox.innerHTML = "";
    if (!val) return;
    const matches = allDiseases
      .filter(d => d.toLowerCase().includes(val))
      .sort((a, b) => a.localeCompare(b))   // alphabetize results
      .slice(0, 10);
    matches.forEach(m => {
      const div = document.createElement("div");
      div.textContent = m;
      div.onclick = () => {
        input.value = m;
        suggestionBox.innerHTML = "";
        refreshAll();
      };
      suggestionBox.appendChild(div);
    });
  });

  document.getElementById("includePubmed").addEventListener("change", refreshAll);
}

document.addEventListener("DOMContentLoaded", init);
