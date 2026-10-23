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
function showApp(user) {
  if (!user) return;
  activeUser = user;
  $("authOverlay").style.display = "none";
  $("appOverlay").style.display = "block";
  $("userGreeting").textContent = (user.user_metadata?.display_name || user.email?.split("@")[0] || "there").trim().split(/\s+/)[0];
  $("txDate").value = localDate();
  loadTransactions();
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

async function loadTransactions() {
  if (!activeUser || loadingTransactions) return;
  loadingTransactions = true;
  $("txRows").innerHTML = '<tr><td colspan="5">Loading your records…</td></tr>';
  try {
    const { data, error } = await db
      .from("hb_transactions")
      .select("id,transaction_type,amount,currency,category,description,transaction_date")
      .eq("user_id", activeUser.id)
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
        money(row.amount) + '</td><td><button type="button" class="btn btn-outline" data-edit-tx="' + escapeText(row.id) + '">Edit</button> <button type="button" class="btn btn-outline" data-delete-tx="' + escapeText(row.id) + '">Delete</button></td></tr>';
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
    transaction_date: $("txDate").value || localDate()
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

try {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (data.session?.user) showApp(data.session.user);
} catch (error) {
  console.error("HustleBook session initialisation failed:", error);
  setMessage("authMsg", "Could not check your saved session. Refresh the page and try again.", true);
}
db.auth.onAuthStateChange((event, session) => {
  if (session?.user && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
    if (activeUser?.id !== session.user.id) showApp(session.user);
  }
  if (event === "SIGNED_OUT") {
    activeUser = null;
    $("appOverlay").style.display = "none";
  }
});
