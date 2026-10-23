import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* HustleBook MVP — authentication and private transaction tracking.
   Uses only the Supabase publishable key; row access is enforced by RLS. */
const SUPABASE_URL = "https://ptluwoeogfkqavhspdjj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wDsWINauH0jX9rezsEwczw_RovrM6Nv";
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = id => document.getElementById(id);
let authMode = "login";
let activeUser = null;
let loadingTransactions = false;
let savedTotals = { income: 0, expense: 0 };
let authRequestInProgress = false;
let editingTransactionId = null;
let workspaces = [];
let activeWorkspaceType = "personal";
let activeWorkspaceId = null;
let workspaceLoadPromise = Promise.resolve();

const money = value => new Intl.NumberFormat("en-KE", {
  style: "currency", currency: "KES", maximumFractionDigits: 2
}).format(Number(value) || 0);
function renderTotals() {
  const draftAmount = Number($("txAmount")?.value) || 0;
  const draftType = $("txType")?.value;
  const draftIncome = draftType === "income" ? draftAmount : 0;
  const draftExpense = draftType === "expense" ? draftAmount : 0;
  $("sumIncome").textContent = money(savedTotals.income + draftIncome);
  $("sumExpense").textContent = money(savedTotals.expense + draftExpense);
  $("sumBalance").textContent = money(savedTotals.income + draftIncome - savedTotals.expense - draftExpense);
}
const localDate = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
};
function setMessage(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#b42318" : "";
}
function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function showAuth(mode = "login") {
  authMode = mode;
  document.body.classList.add("app-mode");
  $("authOverlay").style.display = "flex";
  $("appOverlay").style.display = "none";
  setMessage("authMsg", "");
  $("authTitle").textContent = mode === "signup" ? "Create your HustleBook account" : "Welcome back";
  $("authIntro").textContent = mode === "signup"
    ? "Start organising your money today."
    : "Sign in to see your private financial dashboard.";
  $("authSubmit").textContent = mode === "signup" ? "Create account" : "Log in securely";
  $("nameLabel").style.display = mode === "signup" ? "block" : "none";
  $("authName").style.display = mode === "signup" ? "block" : "none";
  $("authName").required = mode === "signup";
  $("useCaseLabel").style.display = mode === "signup" ? "block" : "none";
  $("authUseCase").style.display = mode === "signup" ? "block" : "none";
  $("authUseCase").required = mode === "signup";
  $("authPassword").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("authSwitch").textContent = mode === "signup"
    ? "Already have an account? Log in"
    : "New to HustleBook? Create an account";
}
function renderQuickNavigation() {
  const welcome = document.querySelector("#appOverlay .app-welcome");
  if (!welcome || $("quickFeatureNav")) return;
  const nav = document.createElement("section");
  nav.id = "quickFeatureNav";
  nav.className = "app-panel";
  nav.innerHTML = '<h2 style="margin:0 0 5px;font-size:20px">All features</h2><p style="margin:0 0 12px;color:#69766d;font-size:13px">Tap any section to open it directly.</p><div id="quickFeatureButtons" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px"></div>';
  const buttons = [
    ["transactions","💸","Transactions"],
    ["budgets","📊","Budgets"],
    ["debts","🤝","Debts"],
    ["savings","🎯","Savings goals"],
    ["customers","👥","Customers"],
    ["products","📦","Products & stock"],
    ["invoices","🧾","Invoices"],
    ["suppliers","🚚","Suppliers"],
    ["jobs","🛠️","Jobs & services"],
    ["reminders","⏰","Bills & reminders"]
  ];
  nav.querySelector("#quickFeatureButtons").innerHTML = buttons.map(([key,icon,label]) =>
    '<button type="button" data-quick-feature="'+key+'" class="btn btn-outline" style="justify-content:flex-start;text-align:left;min-height:46px;white-space:normal">'+icon+' '+label+'</button>'
  ).join("");
  welcome.insertAdjacentElement("afterend", nav);
  nav.addEventListener("click", event => {
    const button = event.target.closest("[data-quick-feature]");
    if (!button) return;
    const key = button.dataset.quickFeature;
    if (key === "transactions") {
      $("txPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    currentModule = key;
    editingModuleRecord = null;
    renderModuleShell();
    loadModuleRows();
    $("moduleCrud")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
function renderWorkspaceCards() {
  const welcome = document.querySelector("#appOverlay .app-welcome");
  if (!welcome || $("workspaceChoiceCard")) return;
  const card = document.createElement("section");
  card.id = "workspaceChoiceCard";
  card.className = "app-panel";
  card.innerHTML = '<h2 style="margin:0 0 5px;font-size:20px">Choose your finance area</h2><p style="margin:0 0 12px;color:#69766d;font-size:13px">Tap Personal, Household or Business to open its transactions and totals.</p><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px"><button type="button" data-workspace-card="personal" class="btn btn-outline" style="min-height:72px;display:flex;flex-direction:column;gap:4px;white-space:normal">👤<span>Personal</span></button><button type="button" data-workspace-card="household" class="btn btn-outline" style="min-height:72px;display:flex;flex-direction:column;gap:4px;white-space:normal">🏡<span>Household & Family</span></button><button type="button" data-workspace-card="business" class="btn btn-outline" style="min-height:72px;display:flex;flex-direction:column;gap:4px;white-space:normal">💼<span>Business & Hustles</span></button></div>';
  welcome.insertAdjacentElement("afterend", card);
  card.addEventListener("click", async event => {
    const button = event.target.closest("[data-workspace-card]");
    if (!button) return;
    card.querySelectorAll("button").forEach(item => item.disabled = true);
    try {
      await workspaceLoadPromise;
      const picker = $("workspacePicker");
      if (!picker) return;
      picker.value = button.dataset.workspaceCard;
      picker.dispatchEvent(new Event("change"));
      await loadModuleRows();
      $("txPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) {
      setMessage("txMsg", "Could not open this finance area: " + (error.message || "Please try again."), true);
    } finally {
      card.querySelectorAll("button").forEach(item => item.disabled = false);
    }
  });
}
function showApp(user) {
  if (!user) return;
  activeUser = user;
  document.body.classList.add("app-mode");
  $("authOverlay").style.display = "none";
  $("appOverlay").style.display = "block";
  $("userGreeting").textContent = (user.user_metadata?.display_name || user.email?.split("@")[0] || "there").trim().split(/\s+/)[0];
  $("txDate").value = localDate();
  renderQuickNavigation();
  renderWorkspaceCards();
  workspaceLoadPromise = loadWorkspacesAndTransactions();
  renderModuleShell();
  loadModuleRows();
}
function formatAuthError(error) {
  const message = error?.message || "Something went wrong. Please try again.";
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect. If this is a new account, confirm your email first.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email using the link we sent you, then log in.";
  if (/already registered|user already registered/i.test(message)) return "This email already has an account. Choose Log in instead.";
  return message;
}

document.getElementById("year").textContent = new Date().getFullYear();
document.querySelectorAll("[data-auth]").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    showAuth(link.dataset.auth === "signup" ? "signup" : "login");
  });
});
$("authClose").addEventListener("click", () => { $("authOverlay").style.display = "none"; });
$("authOverlay").addEventListener("click", event => {
  if (event.target === $("authOverlay")) $("authOverlay").style.display = "none";
});
$("authSwitch").addEventListener("click", event => {
  event.preventDefault();
  showAuth(authMode === "login" ? "signup" : "login");
});



$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (authRequestInProgress) return;
  authRequestInProgress = true;
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  $("authSubmit").disabled = true;
  setMessage("authMsg", "Please wait…");
  try {
    if (authMode === "signup") {
      const displayName = $("authName").value.trim();
      const { data, error } = await db.auth.signUp({
        email, password, options: { data: { display_name: displayName, use_case: $("authUseCase").value } }
      });
      if (error) throw error;
      if (data.session && data.user) {
        showApp(data.user);
      } else {
        setMessage("authMsg", "Account created. Check your email for the confirmation link, then return here and log in.");
      }
    } else {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showApp(data.user);
    }
  } catch (error) {
    setMessage("authMsg", formatAuthError(error), true);
  } finally {
    authRequestInProgress = false;
    $("authSubmit").disabled = false;
  }
});

async function loadWorkspacesAndTransactions() {
  if (!activeUser) return;
  const workspaceTypes = [
    {type:"personal",name:"Personal"},
    {type:"household",name:"Household & Family"},
    {type:"business",name:"Business & Hustles"}
  ];
  try {
    const {data,error}=await db.from("hb_workspaces").select("id,name,workspace_type").eq("user_id",activeUser.id);
    if(error) throw error;
    workspaces=data||[];
    for (const item of workspaceTypes) {
      if (!workspaces.some(w=>w.workspace_type===item.type)) {
        const {data:created,error:createError}=await db.from("hb_workspaces")
          .insert({user_id:activeUser.id,name:item.name,workspace_type:item.type})
          .select("id,name,workspace_type").single();
        if(createError) throw createError;
        workspaces.push(created);
      }
    }
    const selector=$("workspacePicker");
    if(selector) {
      selector.innerHTML=workspaceTypes.map(item=>'<option value="'+item.type+'">'+escapeText(item.name)+'</option>').join("");
      selector.value=activeWorkspaceType;
      selector.onchange=async()=>{
        activeWorkspaceType=selector.value;
        activeWorkspaceId=workspaces.find(w=>w.workspace_type===activeWorkspaceType)?.id||null;
        const label=workspaceTypes.find(w=>w.type===activeWorkspaceType)?.name||"Personal";
        $("workspaceHeading").textContent=label+" transactions";
        $("workspaceDescription").textContent="Income, expenses and balance shown only for "+label+".";
        editingTransactionId=null;
        $("txForm").reset();
        $("txDate").value=localDate();
        $("txSubmit").textContent="Save transaction";
        await loadTransactions();
        await loadModuleRows();
      };
    }
    activeWorkspaceId=workspaces.find(w=>w.workspace_type===activeWorkspaceType)?.id||null;
    $("workspaceHeading").textContent=(workspaceTypes.find(w=>w.type===activeWorkspaceType)?.name||"Personal")+" transactions";
    await loadTransactions();
    await loadModuleRows();
  } catch(error) {
    setMessage("txMsg","Could not prepare your separate finance areas: "+(error.message||"Check that supabase/schema.sql has been run."),true);
  }
}

async function loadTransactions() {
  if (!activeUser || loadingTransactions) return;
  loadingTransactions = true;
  $("txRows").innerHTML = '<tr><td colspan="5">Loading your records…</td></tr>';
  try {
    let query = db.from("hb_transactions")
      .select("id,transaction_type,amount,currency,category,description,transaction_date,workspace_id,created_at")
      .eq("user_id", activeUser.id);
    if (activeWorkspaceId) {
      query = activeWorkspaceType === "personal"
        ? query.or("workspace_id.eq."+activeWorkspaceId+",workspace_id.is.null")
        : query.eq("workspace_id",activeWorkspaceId);
    }
    const { data, error } = await query
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const rows = data || [];
    let income = 0;
    let expense = 0;
    rows.forEach(row => {
      if (row.transaction_type === "income") income += Number(row.amount);
      if (row.transaction_type === "expense") expense += Number(row.amount);
    });
    savedTotals = { income, expense };
    renderTotals();
    $("txRows").innerHTML = rows.length ? rows.map(row => {
      const isIncome = row.transaction_type === "income";
      const label = row.description || row.category || "Transaction";
      return '<tr><td>' + escapeText(row.transaction_date || "") +
        '</td><td><b>' + escapeText(label) + '</b><br><span style="color:#687b6e">' +
        escapeText(row.category || "Other") + '</span></td><td>' +
        escapeText(row.transaction_type) + '</td><td style="font-weight:800;color:' +
        (isIncome ? "#218047" : "#b54747") + '">' + (isIncome ? "+" : "−") +
        money(row.amount) + '</td><td class="action-icons"><button type="button" class="icon-action edit-icon" aria-label="Edit transaction" title="Edit transaction" data-edit-tx="' + escapeText(row.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button type="button" class="icon-action delete-icon" aria-label="Delete transaction" title="Delete transaction" data-delete-tx="' + escapeText(row.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m2 0-1 14H7L6 6m4 4v6m4-6v6"/></svg></button></td></tr>';
    }).join("") : '<tr><td colspan="5">No transactions yet. Add your first one above.</td></tr>';
  } catch (error) {
    $("txRows").innerHTML = '<tr><td colspan="5">Could not load transactions: ' +
      escapeText(error.message || "Please try again.") + '</td></tr>';
    setMessage("txMsg", "Your account is open, but transactions could not be loaded. Check the hb_transactions table and its authenticated-user RLS policies.", true);
  } finally {
    loadingTransactions = false;
  }
}

$("txRows").addEventListener("click", async event => {
  const edit = event.target.closest("[data-edit-tx]");
  const remove = event.target.closest("[data-delete-tx]");
  if (!activeUser) return;
  if (edit) {
    try {
      const { data, error } = await db.from("hb_transactions").select("*").eq("id", edit.dataset.editTx).eq("user_id", activeUser.id).single();
      if (error) throw error;
      editingTransactionId = data.id;
      $("txType").value = data.transaction_type;
      $("txAmount").value = data.amount;
      $("txCategory").value = data.category || "Other";
      $("txDate").value = data.transaction_date || localDate();
      $("txDescription").value = data.description || "";
      $("txSubmit").textContent = "Update transaction";
      setMessage("txMsg", "Editing transaction. Save to apply changes.");
      renderTotals();
      $("txPanel").scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) { setMessage("txMsg", "Could not open transaction: " + (error.message || "Try again."), true); }
  }
  if (remove && window.confirm("Delete this transaction permanently?")) {
    remove.disabled = true;
    try {
      const { error } = await db.from("hb_transactions").delete().eq("id", remove.dataset.deleteTx).eq("user_id", activeUser.id);
      if (error) throw error;
      if (editingTransactionId === remove.dataset.deleteTx) {
        editingTransactionId = null;
        $("txForm").reset();
        $("txSubmit").textContent = "Save transaction";
      }
      setMessage("txMsg", "Transaction deleted.");
      await loadTransactions();
    } catch (error) { setMessage("txMsg", "Delete failed: " + (error.message || "Try again."), true); }
    finally { remove.disabled = false; }
  }
});
$("txAmount").addEventListener("input", renderTotals);
$("txType").addEventListener("change", renderTotals);
$("txForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!activeUser) { showAuth("login"); return; }
  const amount = Number($("txAmount").value);
  if (!Number.isFinite(amount) || amount <= 0) {
    setMessage("txMsg", "Enter an amount greater than zero.", true);
    return;
  }
  const payload = {
    user_id: activeUser.id,
    transaction_type: $("txType").value,
    amount,
    currency: "KES",
    category: $("txCategory").value.trim() || "Other",
    description: $("txDescription").value.trim() || $("txCategory").value.trim() || "Other",
    transaction_date: $("txDate").value || localDate(),
    workspace_id: activeWorkspaceId
  };
  $("txSubmit").disabled = true;
  setMessage("txMsg", "Saving transaction…");
  try {
    const result = editingTransactionId
      ? await db.from("hb_transactions").update(payload).eq("id", editingTransactionId).eq("user_id", activeUser.id)
      : await db.from("hb_transactions").insert(payload);
    const { error } = result;
    if (error) throw error;
    $("txAmount").value = "";
    $("txDescription").value = "";
    editingTransactionId = null;
    $("txSubmit").textContent = "Save transaction";
    renderTotals();
    setMessage("txMsg", "Transaction saved successfully.");
    await loadTransactions();
  } catch (error) {
    setMessage("txMsg", "Save failed: " + (error.message || "Please try again."), true);
  } finally {
    $("txSubmit").disabled = false;
  }
});
function openTransactionForm(type) {
  if (type) $("txType").value = type;
  $("txPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  $("txAmount").focus({ preventScroll: true });
}
$("addTxJump").addEventListener("click", () => openTransactionForm());
$("incomeCard").addEventListener("click", () => openTransactionForm("income"));
$("expenseCard").addEventListener("click", () => openTransactionForm("expense"));
$("balanceCard").addEventListener("click", () => $("txRows").closest(".app-panel").scrollIntoView({ behavior: "smooth", block: "start" }));
["incomeCard","expenseCard","balanceCard"].forEach(id => $(id).addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $(id).click(); }
}));
$("signOutBtn").addEventListener("click", async () => {
  $("signOutBtn").disabled = true;
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    activeUser = null;
    $("appOverlay").style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
    showAuth("login");
  } catch (error) {
    setMessage("txMsg", "Could not sign out: " + (error.message || "Please try again."), true);
  } finally {
    $("signOutBtn").disabled = false;
  }
});


// CRUD manager for the other user-owned MVP modules.
const moduleConfigs = {
  budgets: {table:"hb_budgets", title:"Budgets", fields:[
    ["name","Budget name","text",true],["category","Category","text",false],["amount","Budget amount (KES)","number",true],["period","Period","select",true,["weekly","monthly","yearly"]],["starts_on","Start date","date",true]]},
  debts: {table:"hb_debts", title:"Debts", fields:[
    ["name","Person / debt name","text",true],["debt_type","Debt direction","select",true,["owed_by_me","owed_to_me"]],["original_amount","Original amount (KES)","number",true],["balance_amount","Remaining balance (KES)","number",true],["due_date","Due date","date",false],["notes","Notes","text",false]]},
  savings: {table:"hb_savings_goals", title:"Savings goals", fields:[
    ["name","Goal name","text",true],["target_amount","Target amount (KES)","number",true],["saved_amount","Amount saved (KES)","number",true],["target_date","Target date","date",false]]},
  customers: {table:"hb_customers", title:"Customers", fields:[
    ["name","Customer name","text",true],["email","Email","email",false],["phone","Phone","tel",false],["notes","Notes","text",false]]},
  products: {table:"hb_products", title:"Products / stock", fields:[
    ["name","Product name","text",true],["sku","SKU / code","text",false],["quantity","Quantity","number",true],["unit_cost","Unit cost (KES)","number",true],["selling_price","Selling price (KES)","number",true]]},
  invoices: {table:"hb_invoices", title:"Invoices", fields:[
    ["invoice_number","Invoice number","text",true],["status","Status","select",true,["draft","sent","part_paid","paid","overdue","cancelled"]],["subtotal","Subtotal (KES)","number",true],["tax_amount","Tax (KES)","number",true],["total_amount","Total (KES)","number",true],["issue_date","Issue date","date",true],["due_date","Due date","date",false]]},
  suppliers: {table:"hb_suppliers", title:"Suppliers", fields:[
    ["name","Supplier name","text",true],["email","Email","email",false],["phone","Phone","tel",false],["notes","Notes","text",false]]},
  jobs: {table:"hb_jobs", title:"Jobs & services", fields:[
    ["name","Job / service name","text",true],["customer_name","Customer name","text",false],["status","Job status","select",true,["new","in_progress","waiting_payment","completed","cancelled"]],["quoted_amount","Quoted amount (KES)","number",true],["paid_amount","Amount received (KES)","number",true],["due_date","Due date","date",false],["notes","Notes","text",false]]},
  reminders: {table:"hb_reminders", title:"Bills & reminders", fields:[
    ["title","Reminder title","text",true],["amount","Amount (KES)","number",false],["due_date","Due date","date",true],["status","Status","select",true,["pending","completed","dismissed"]],["notes","Notes","text",false]]}
};
let currentModule = "budgets";
let editingModuleRecord = null;
function moduleValue(field, value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
function renderModuleShell() {
  const host = $("moduleCrud");
  if (!host) return;
  const cfg = moduleConfigs[currentModule];
  const moduleSwitcher = currentModule === "budgets" ? "" :
    '<p style="font-size:13px;color:#68766d;margin:0 0 10px">Choose a tool below. Each area has its own saved records.</p>' +
    '<div id="moduleNav" style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">' +
    Object.keys(moduleConfigs).map(key => '<button type="button" data-open-module="' + key + '" class="btn ' + (key===currentModule?'btn-green':'btn-outline') + '" style="padding:9px 12px;font-size:12px">' + escapeText(moduleConfigs[key].title) + '</button>').join("") +
    '</div><label for="modulePicker" style="display:block;font-size:12px;font-weight:750;margin-bottom:5px">Or choose an area</label>' +
    '<select id="modulePicker" style="width:100%;padding:12px;border:1px solid #dce5de;border-radius:10px;background:white;font:inherit">' +
    Object.keys(moduleConfigs).map(key => '<option value="' + key + '"' + (key===currentModule?' selected':'') + '>' + escapeText(moduleConfigs[key].title) + '</option>').join("") +
    '</select>';
  host.innerHTML = '<h2 style="margin:0 0 12px;font-size:21px">' + escapeText(cfg.title) + '</h2>' +
    moduleSwitcher +
    (currentModule === "budgets" ? '<div id="budgetTotalCard" style="background:#f0f8f2;border:1px solid #d6e9da;border-radius:12px;padding:15px;margin:0 0 12px"><div style="font-size:13px;color:#52665a">Total planned budget</div><strong id="budgetTotalValue" style="display:block;font-size:25px;margin-top:5px">KSh 0.00</strong><div id="budgetCount" style="font-size:12px;color:#68766d;margin-top:4px">0 budgets</div></div>' : '') +
    '<form id="moduleForm" class="tx-form" style="margin-top:12px">'
    cfg.fields.map(field => '<div><label for="mf_' + field[0] + '">' + escapeText(field[1]) + '</label>' +
      (field[2] === "select" ? '<select id="mf_' + field[0] + '" ' + (field[3]?'required':'') + '>' + field[4].map(opt=>'<option value="'+escapeText(opt)+'">'+escapeText(({owed_by_me:"I owe someone",owed_to_me:"Someone owes me"}[opt] || opt.replaceAll("_"," ")))+'</option>').join("") + '</select>' :
      '<input id="mf_' + field[0] + '" type="' + field[2] + '" ' + (field[2]==="number"?'min="0" step="0.01"':'') + (field[3]?' required':'') + ' placeholder="' + escapeText(field[1]) + '">') + '</div>').join("") +
    '<div class="full" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-green" id="moduleSave" type="submit">Save record</button><button class="btn btn-outline" id="moduleCancel" type="button">Clear form</button></div></form>' +
    '<p id="moduleMsg" class="auth-msg" aria-live="polite"></p><div id="moduleRows" style="display:grid;gap:9px;margin-top:12px"></div>';
  $("moduleNav")?.querySelectorAll("[data-open-module]").forEach(button => button.addEventListener("click", () => { currentModule=button.dataset.openModule; editingModuleRecord=null; renderModuleShell(); loadModuleRows(); }));
  $("modulePicker")?.addEventListener("change", () => { currentModule=$("modulePicker").value; editingModuleRecord=null; renderModuleShell(); loadModuleRows(); });
  $("moduleCancel").addEventListener("click", () => { editingModuleRecord=null; renderModuleShell(); loadModuleRows(); });
  $("moduleForm").addEventListener("submit", saveModuleRecord);
}
async function loadModuleRows() {
  if (!activeUser || !$("moduleRows")) return;
  const cfg=moduleConfigs[currentModule];
  $("moduleRows").innerHTML='<p>Loading records…</p>';
  try {
    let moduleQuery = db.from(cfg.table).select("*").eq("user_id",activeUser.id);
    if (activeWorkspaceId) {
      moduleQuery = activeWorkspaceType === "personal"
        ? moduleQuery.or("workspace_id.eq."+activeWorkspaceId+",workspace_id.is.null")
        : moduleQuery.eq("workspace_id",activeWorkspaceId);
    }
    const {data,error}=await moduleQuery.order("created_at",{ascending:false}).limit(100);
    if(error) throw error;
    if (currentModule === "budgets") {
      const total = (data || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      if ($("budgetTotalValue")) $("budgetTotalValue").textContent = money(total);
      if ($("budgetCount")) $("budgetCount").textContent = (data || []).length + ((data || []).length === 1 ? " budget" : " budgets");
    }
    $("moduleRows").innerHTML=(data||[]).length ? data.map(row => {
      const summary=cfg.fields.map(field=>field[1]+": "+(row[field[0]] ?? "—")).join(" · ");
      return '<article style="border:1px solid #e2e9e3;border-radius:12px;padding:13px;overflow-wrap:anywhere"><strong>'+escapeText(row.name || row.invoice_number || cfg.title.slice(0,-1))+'</strong><p style="font-size:12px;color:#68766d;margin:6px 0 10px">'+escapeText(summary)+'</p><div class="action-icons"><button class="icon-action edit-icon" type="button" aria-label="Edit record" title="Edit record" data-module-edit="'+escapeText(row.id)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="icon-action delete-icon" type="button" aria-label="Delete record" title="Delete record" data-module-delete="'+escapeText(row.id)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m2 0-1 14H7L6 6m4 4v6m4-6v6"/></svg></button></div></article>';
    }).join("") : '<p>No records yet.</p>';
    $("moduleRows").querySelectorAll("[data-module-edit]").forEach(btn=>btn.addEventListener("click",()=>{
      const row=(data||[]).find(item=>item.id===btn.dataset.moduleEdit);
      if(!row)return;
      editingModuleRecord=row.id;
      cfg.fields.forEach(field=>{const el=$("mf_"+field[0]);if(el)el.value=moduleValue(field[0],row[field[0]]);});
      $("moduleSave").textContent="Update record";
      setMessage("moduleMsg","Editing record. Save to apply changes.");
      $("moduleCrud").scrollIntoView({behavior:"smooth",block:"start"});
    }));
    $("moduleRows").querySelectorAll("[data-module-delete]").forEach(btn=>btn.addEventListener("click",async()=>{
      if(!window.confirm("Delete this record permanently?"))return;
      btn.disabled=true;
      try {
        const {error}=await db.from(cfg.table).delete().eq("id",btn.dataset.moduleDelete).eq("user_id",activeUser.id);
        if(error)throw error;
        setMessage("moduleMsg","Record deleted.");
        await loadModuleRows();
      } catch(error){setMessage("moduleMsg","Delete failed: "+(error.message||"Try again."),true);}
      finally{btn.disabled=false;}
    }));
  } catch(error) {
    $("moduleRows").innerHTML='<p>Could not load records: '+escapeText(error.message||"Please try again.")+'</p>';
  }
}
async function saveModuleRecord(event) {
  event.preventDefault();
  if(!activeUser)return;
  const cfg=moduleConfigs[currentModule];
  const payload={user_id:activeUser.id};
  if (activeWorkspaceId) payload.workspace_id = activeWorkspaceId;
  if(["budgets","debts","savings","products","invoices","jobs","reminders"].includes(currentModule)) payload.currency="KES";
  cfg.fields.forEach(field=>{
    const el=$("mf_"+field[0]);
    if(!el)return;
    const value=el.value.trim();
    if(value!=="") payload[field[0]]=field[2]==="number"?Number(value):value;
    else if(["category","due_date","target_date","notes","email","phone","sku","customer_name"].includes(field[0])) payload[field[0]]=null;
  });
  $("moduleSave").disabled=true;
  try {
    const result=editingModuleRecord
      ? await db.from(cfg.table).update(payload).eq("id",editingModuleRecord).eq("user_id",activeUser.id)
      : await db.from(cfg.table).insert(payload);
    if(result.error)throw result.error;
    editingModuleRecord=null;
    renderModuleShell();
    await loadModuleRows();
    setMessage("moduleMsg","Record saved successfully.");
  } catch(error){setMessage("moduleMsg","Save failed: "+(error.message||"Please try again."),true);}
  finally{if($("moduleSave"))$("moduleSave").disabled=false;}
}

try {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (data.session?.user) {
    showApp(data.session.user);
  } else {
    // Open directly to sign-in; keep the marketing landing page out of the app flow.
    document.body.classList.add("app-mode");
    showAuth("login");
  }
} catch (error) {
  console.error("HustleBook session initialisation failed:", error);
  document.body.classList.add("app-mode");
  showAuth("login");
  setMessage("authMsg", "Could not check your saved session. Refresh the page and try again.", true);
}
db.auth.onAuthStateChange((event, session) => {
  if (session?.user && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
    if (activeUser?.id !== session.user.id) showApp(session.user);
  }
  if (event === "SIGNED_OUT") {
    activeUser = null;
    document.body.classList.add("app-mode");
    $("appOverlay").style.display = "none";
    showAuth("login");
    $("authOverlay").style.display = "flex";
  }
});


/* Fixed bottom navigation for phone users */
function navigateApp(section) {
  if (!activeUser) {
    $("authOverlay")?.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  document.querySelectorAll("#mobileAppNav [data-app-nav]").forEach(button => {
    const active = button.dataset.appNav === section;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  if (section === "home") {
    $("appOverlay")?.scrollTo({top:0,behavior:"smooth"});
    return;
  }
  if (section === "transactions") {
    $("txPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }

  const nextModule = section === "budgets" ? "budgets"
    : section === "debts" ? "debts"
    : "savings";
  currentModule = nextModule;
  editingModuleRecord = null;
  renderModuleShell();
  loadModuleRows();
  $("moduleCrud")?.scrollIntoView({behavior:"smooth",block:"start"});
}

/* Delegated click handling keeps navigation working after UI rerenders. */
document.addEventListener("click", event => {
  const button = event.target.closest("#mobileAppNav [data-app-nav]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  navigateApp(button.dataset.appNav);
});
