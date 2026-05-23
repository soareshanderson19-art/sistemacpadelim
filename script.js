/* ============================================================
   CPAD ELIM — SCRIPT.JS
   Sistema de Cadastro de Alunos e Clientes
   Integrado com Firebase Realtime Database
   ============================================================ */

'use strict';

/* ========================= FIREBASE CONFIG ========================= */
const firebaseConfig = {
  apiKey:            "AIzaSyD13rVUTrZfX-4N94214L3kGJPcisoP8Wg",
  authDomain:        "cpadelim.firebaseapp.com",
  databaseURL:       "https://cpadelim-default-rtdb.firebaseio.com",
  projectId:         "cpadelim",
  storageBucket:     "cpadelim.firebasestorage.app",
  messagingSenderId: "237719774394",
  appId:             "1:237719774394:web:d2c0c0b6df0af1a929ce83",
  measurementId:     "G-9882B423CF"
};

firebase.initializeApp(firebaseConfig);
const db           = firebase.database();
const cadastrosRef = db.ref('cadastros');

/* ========================= CONSTANTS ========================= */
const LS_PDFS = 'cpadElim_pdfsCount';

/* ========================= STATE ========================= */
let cadastros       = [];
let pdfCount        = parseInt(localStorage.getItem(LS_PDFS) || '0');
let adminLogado     = false;
let pendingDeleteId = null;
let produtosAlvoId  = null;

/* ========================= FIREBASE LISTENER (TEMPO REAL) ========================= */
document.addEventListener('DOMContentLoaded', () => {
  mostrarLoading(true);

  cadastrosRef.orderByChild('createdAt').on('value', snapshot => {
    cadastros = [];
    snapshot.forEach(child => {
      cadastros.push({ id: child.key, ...child.val() });
    });
    cadastros.reverse();

    mostrarLoading(false);
    atualizarContadorHeader();
    atualizarSummary();
    if (adminLogado) renderTabela();
  }, err => {
    mostrarLoading(false);
    mostrarToast('Erro ao conectar ao banco de dados.', 'danger');
    console.error(err);
  });
});

/* ========================= LOADING INDICATOR ========================= */
function mostrarLoading(show) {
  let el = document.getElementById('firebase-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'firebase-loading';
    el.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Conectando ao Firebase...';
    el.style.cssText = `
      position:fixed;top:70px;right:14px;background:#b5177b;color:#fff;
      padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;
      display:flex;align-items:center;gap:8px;z-index:9999;
      box-shadow:0 4px 16px rgba(181,23,123,.4);transition:opacity .3s;
    `;
    document.body.appendChild(el);
  }
  el.style.opacity = show ? '1' : '0';
  if (!show) setTimeout(() => { if (el) el.style.display = 'none'; }, 350);
  else el.style.display = 'flex';
}

/* ========================= TAB SWITCHING ========================= */
function switchTab(tabId, el) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  if (el) el.classList.add('active');

  const labels = { tab1: 'Cadastro de Aluno / Cliente', tab2: 'Área Administrativa' };
  document.getElementById('breadcrumb-text').textContent = labels[tabId] || '';

  /* Sincronizar bottom nav */
  const bnMap = { tab1: 'bn-tab1', tab2: 'bn-tab2' };
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
  const bnEl = document.getElementById(bnMap[tabId]);
  if (bnEl) bnEl.classList.add('active');

  if (tabId === 'tab2' && adminLogado) renderTabela();
  if (tabId === 'tab2' && !adminLogado) focarSenha();

  /* Fechar sidebar no mobile ao trocar de aba */
  if (window.innerWidth <= 768) closeSidebar();
}

function focarSenha() {
  setTimeout(() => {
    const inp = document.getElementById('senha-input');
    if (inp) inp.focus();
  }, 80);
}

/* ========================= SIDEBAR TOGGLE ========================= */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const wrapper  = document.getElementById('main-wrapper');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  } else {
    const collapsed = sidebar.classList.toggle('collapsed');
    wrapper.classList.toggle('collapsed', collapsed);
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

/* ========================= BOTTOM NAV ========================= */
function setBottomNav(activeId) {
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(activeId);
  if (el) el.classList.add('active');
  closeSidebar();
}

/* ========================= MÁSCARAS ========================= */
function mascararCPF(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9)      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/^(\d{3})(\d+)/, '$1.$2');
  input.value = v;
}

function mascararCEP(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d+)/, '$1-$2');
  input.value = v;
}

function mascararTelefone(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10)     v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)/, '($1) $2');
  input.value = v;
}

/* ========================= BUSCAR CEP ========================= */
async function buscarCEP() {
  const cepVal = document.getElementById('cep').value.replace(/\D/g, '');
  if (cepVal.length !== 8) return;
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${cepVal}/json/`);
    const data = await res.json();
    if (!data.erro) {
      const endAtual = document.getElementById('endereco').value;
      if (!endAtual) {
        document.getElementById('endereco').value =
          `${data.logradouro || ''}, ${data.bairro || ''} — ${data.localidade || ''}/${data.uf || ''}`
            .replace(/^, /, '').replace(/ — $/, '');
      }
    }
  } catch {}
}

/* ========================= SALVAR CADASTRO ========================= */
async function salvarCadastro(e) {
  e.preventDefault();

  const btnSalvar = document.getElementById('btn-salvar');
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...';

  try {
    const editId = document.getElementById('edit-id').value;
    const dados  = coletarFormulario();

    if (editId) {
      await cadastrosRef.child(editId).update({
        ...dados,
        updatedAt: new Date().toISOString()
      });
      mostrarToast('Cadastro atualizado com sucesso!', 'success');
    } else {
      await cadastrosRef.push({
        ...dados,
        produtos:  [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      mostrarToast('Cadastro realizado com sucesso!', 'success');
    }

    limparFormulario();
  } catch (err) {
    mostrarToast('Erro ao salvar. Verifique a conexão.', 'danger');
    console.error(err);
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = '<i class="fas fa-floppy-disk"></i> Salvar Cadastro';
  }
}

function coletarFormulario() {
  return {
    nome:        document.getElementById('nome').value.trim(),
    cpf:         document.getElementById('cpf').value.trim(),
    dataNasc:    document.getElementById('dataNasc').value,
    endereco:    document.getElementById('endereco').value.trim(),
    cep:         document.getElementById('cep').value.trim(),
    telefone:    document.getElementById('telefone').value.trim(),
    email:       document.getElementById('email').value.trim(),
    observacoes: document.getElementById('observacoes').value.trim(),
  };
}

function limparFormulario() {
  document.getElementById('cadastro-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('btn-salvar').innerHTML = '<i class="fas fa-floppy-disk"></i> Salvar Cadastro';
}

/* ========================= CONTADOR HEADER ========================= */
function atualizarContadorHeader() {
  document.getElementById('total-count').textContent = cadastros.length;
}

/* ========================= SENHA ========================= */
const SENHA_CORRETA = '972130';

function verificarSenha() {
  const val   = document.getElementById('senha-input').value;
  const erroEl = document.getElementById('senha-erro');

  if (val === SENHA_CORRETA) {
    adminLogado = true;
    document.getElementById('senha-screen').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    atualizarSummary();
    renderTabela();
    document.getElementById('senha-input').value = '';
    erroEl.textContent = '';
  } else {
    erroEl.textContent = 'Senha incorreta. Tente novamente.';
    document.getElementById('senha-input').value = '';
    document.getElementById('senha-input').focus();
    document.getElementById('senha-input').classList.add('shake');
    setTimeout(() => document.getElementById('senha-input').classList.remove('shake'), 400);
  }
}

function toggleSenhaVisivel() {
  const inp = document.getElementById('senha-input');
  const ico = document.getElementById('icon-eye');
  if (inp.type === 'password') {
    inp.type = 'text';
    ico.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    inp.type = 'password';
    ico.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

function sairAdmin() {
  adminLogado = false;
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('senha-screen').classList.remove('hidden');
  focarSenha();
  mostrarToast('Sessão encerrada.', 'warning');
}

/* ========================= SUMMARY ========================= */
function atualizarSummary() {
  const hoje        = new Date().toISOString().slice(0, 10);
  const hoje_count  = cadastros.filter(c => (c.createdAt || '').startsWith(hoje)).length;
  const email_count = cadastros.filter(c => c.email).length;

  document.getElementById('sc-total').textContent = cadastros.length;
  document.getElementById('sc-today').textContent = hoje_count;
  document.getElementById('sc-pdfs').textContent  = pdfCount;
  document.getElementById('sc-email').textContent = email_count;
  atualizarContadorHeader();
}

/* ========================= RENDER TABELA ========================= */
function renderTabela(lista = cadastros) {
  const tbody = document.getElementById('admin-tbody');
  const empty = document.getElementById('empty-state');

  tbody.innerHTML = '';

  if (!lista || lista.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  lista.forEach((c, i) => {
    const wa    = c.telefone ? c.telefone.replace(/\D/g, '') : '';
    const waUrl = wa ? `https://wa.me/55${wa}` : null;
    const dataBR   = c.dataNasc ? formatarData(c.dataNasc) : '—';
    const criadoBR = formatarDataHora(c.createdAt);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${escHtml(c.nome) || '<span style="color:#94a3b8">—</span>'}</strong></td>
      <td>${escHtml(c.cpf) || '—'}</td>
      <td>
        ${waUrl
          ? `<a href="${waUrl}" target="_blank" class="wa-link"><i class="fab fa-whatsapp"></i>${escHtml(c.telefone)}</a>`
          : (escHtml(c.telefone) || '—')
        }
      </td>
      <td>${escHtml(c.email) || '—'}</td>
      <td>${dataBR}</td>
      <td><span class="badge-row"><i class="fas fa-clock" style="font-size:.7rem"></i> ${criadoBR}</span></td>
      <td>
        <div class="td-actions">
          <button class="btn btn-warning btn-sm" onclick="abrirEditar('${c.id}')" title="Editar">
            <i class="fas fa-pen-to-square"></i> Editar
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmarExclusao('${c.id}')" title="Excluir">
            <i class="fas fa-trash"></i> Excluir
          </button>
          <button class="btn btn-purple btn-sm" onclick="abrirProdutos('${c.id}')" title="Produtos">
            <i class="fas fa-box-open"></i> Produtos
          </button>
          <button class="btn btn-info btn-sm" onclick="gerarPDF('${c.id}')" title="Gerar PDF">
            <i class="fas fa-file-pdf"></i> PDF
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ========================= FILTRO/BUSCA ========================= */
function filtrarCadastros() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  if (!q) { renderTabela(cadastros); return; }
  const filtrado = cadastros.filter(c =>
    (c.nome     || '').toLowerCase().includes(q) ||
    (c.cpf      || '').toLowerCase().includes(q) ||
    (c.telefone || '').toLowerCase().includes(q) ||
    (c.email    || '').toLowerCase().includes(q)
  );
  renderTabela(filtrado);
}

/* ========================= EDITAR ========================= */
function abrirEditar(id) {
  const c = cadastros.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-id').value       = id;
  document.getElementById('modal-nome').value     = c.nome || '';
  document.getElementById('modal-cpf').value      = c.cpf || '';
  document.getElementById('modal-data').value     = c.dataNasc || '';
  document.getElementById('modal-endereco').value = c.endereco || '';
  document.getElementById('modal-cep').value      = c.cep || '';
  document.getElementById('modal-tel').value      = c.telefone || '';
  document.getElementById('modal-email').value    = c.email || '';
  document.getElementById('modal-obs').value      = c.observacoes || '';
  document.getElementById('modal-edit').classList.remove('hidden');
}

function fecharModal() {
  document.getElementById('modal-edit').classList.add('hidden');
}

async function salvarEdicao(e) {
  e.preventDefault();
  const id  = document.getElementById('modal-id').value;
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...'; }

  try {
    await cadastrosRef.child(id).update({
      nome:        document.getElementById('modal-nome').value.trim(),
      cpf:         document.getElementById('modal-cpf').value.trim(),
      dataNasc:    document.getElementById('modal-data').value,
      endereco:    document.getElementById('modal-endereco').value.trim(),
      cep:         document.getElementById('modal-cep').value.trim(),
      telefone:    document.getElementById('modal-tel').value.trim(),
      email:       document.getElementById('modal-email').value.trim(),
      observacoes: document.getElementById('modal-obs').value.trim(),
      updatedAt:   new Date().toISOString(),
    });
    fecharModal();
    mostrarToast('Cadastro atualizado com sucesso!', 'success');
  } catch (err) {
    mostrarToast('Erro ao atualizar. Tente novamente.', 'danger');
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Salvar Alterações'; }
  }
}

/* ========================= EXCLUIR ========================= */
function confirmarExclusao(id) {
  pendingDeleteId = id;
  const c = cadastros.find(x => x.id === id);
  const nome = c && c.nome ? c.nome : 'este cadastro';
  document.getElementById('modal-delete-msg').textContent =
    `Tem certeza que deseja excluir o cadastro de "${nome}"? Esta ação não pode ser desfeita.`;
  document.getElementById('btn-confirm-delete').onclick = () => executarExclusao(id);
  document.getElementById('modal-delete').classList.remove('hidden');
}

async function executarExclusao(id) {
  const btn = document.getElementById('btn-confirm-delete');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Excluindo...';

  try {
    await cadastrosRef.child(id).remove();
    fecharModalDelete();
    mostrarToast('Cadastro excluído.', 'danger');
  } catch (err) {
    mostrarToast('Erro ao excluir. Tente novamente.', 'danger');
    console.error(err);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
  }
}

function fecharModalDelete() {
  document.getElementById('modal-delete').classList.add('hidden');
  const btn = document.getElementById('btn-confirm-delete');
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
  pendingDeleteId = null;
}

/* ========================= PRODUTOS ========================= */
function abrirProdutos(id) {
  produtosAlvoId = id;
  const c = cadastros.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-produtos-nome').textContent =
    `Aluno/Cliente: ${c.nome || '(sem nome)'}`;
  document.getElementById('produto-input').value = '';
  document.getElementById('produto-valor').value = '';
  renderProdutos(c.produtos || []);
  document.getElementById('modal-produtos').classList.remove('hidden');
}

function fecharModalProdutos() {
  document.getElementById('modal-produtos').classList.add('hidden');
  produtosAlvoId = null;
}

function renderProdutos(produtos) {
  const tbody = document.getElementById('produtos-tbody');
  tbody.innerHTML = '';
  let total = 0;
  if (!produtos || produtos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px">Nenhum produto adicionado.</td></tr>';
  } else {
    produtos.forEach((p, i) => {
      total += parseFloat(p.valor) || 0;
      tbody.innerHTML += `
        <tr>
          <td>${i + 1}</td>
          <td>${escHtml(p.nome)}</td>
          <td>R$ ${parseFloat(p.valor || 0).toFixed(2).replace('.', ',')}</td>
          <td><button class="btn btn-danger btn-sm" onclick="removerProduto(${i})"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    });
  }
  document.getElementById('produtos-total-val').textContent =
    'R$ ' + total.toFixed(2).replace('.', ',');
}

function adicionarProduto() {
  const nome  = document.getElementById('produto-input').value.trim();
  const valor = parseFloat(document.getElementById('produto-valor').value) || 0;
  if (!nome) { mostrarToast('Digite o nome do produto.', 'warning'); return; }
  const c = cadastros.find(x => x.id === produtosAlvoId);
  if (!c) return;
  if (!c.produtos) c.produtos = [];
  c.produtos.push({ nome, valor });
  renderProdutos(c.produtos);
  document.getElementById('produto-input').value = '';
  document.getElementById('produto-valor').value = '';
}

function removerProduto(idx) {
  const c = cadastros.find(x => x.id === produtosAlvoId);
  if (!c || !c.produtos) return;
  c.produtos.splice(idx, 1);
  renderProdutos(c.produtos);
}

async function salvarProdutos() {
  const c = cadastros.find(x => x.id === produtosAlvoId);
  if (!c) return;

  try {
    await cadastrosRef.child(produtosAlvoId).update({
      produtos:  c.produtos || [],
      updatedAt: new Date().toISOString()
    });
    fecharModalProdutos();
    mostrarToast('Produtos salvos com sucesso!', 'success');
  } catch (err) {
    mostrarToast('Erro ao salvar produtos.', 'danger');
    console.error(err);
  }
}

/* ========================= GERAR PDF ========================= */
function gerarPDF(id) {
  const c = cadastros.find(x => x.id === id);
  if (!c) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const PW  = 210;
  const PH  = 297;
  const ML  = 18;
  const MR  = 18;
  const CW  = PW - ML - MR;

  const INDIGO   = [79,  70, 229];
  const INDIGO_D = [55,  48, 163];
  const WHITE    = [255, 255, 255];
  const GRAY_100 = [248, 250, 252];
  const GRAY_200 = [226, 232, 240];
  const GRAY_700 = [51,  65,  85];
  const GRAY_900 = [15,  23,  42];
  const GREEN    = [16, 185, 129];
  const PURPLE   = [139, 92, 246];

  for (let y = 0; y < 42; y++) {
    const r = Math.round(INDIGO[0] + (INDIGO_D[0] - INDIGO[0]) * y / 42);
    const g = Math.round(INDIGO[1] + (INDIGO_D[1] - INDIGO[1]) * y / 42);
    const b = Math.round(INDIGO[2] + (INDIGO_D[2] - INDIGO[2]) * y / 42);
    doc.setFillColor(r, g, b);
    doc.rect(0, y, PW, 1, 'F');
  }

  doc.setFillColor(...GREEN);
  doc.rect(0, 0, PW, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text('CPAD ELIM', ML, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 255);
  doc.text('Sistema de Cadastro de Alunos e Clientes', ML, 27);

  doc.setFillColor(...GREEN);
  doc.roundedRect(PW - ML - 42, 10, 42, 10, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);
  doc.text('FICHA CADASTRAL', PW - ML - 21, 16.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 230);
  doc.text(`Emitido em: ${formatarDataHoraBR(new Date().toISOString())}`, PW - ML, 35, { align: 'right' });

  let y = 52;

  y = secaoHeader(doc, 'DADOS PESSOAIS', ML, y, INDIGO, WHITE);
  y += 2;

  const dadosPessoais = [
    ['Nome Completo',      c.nome   || '—'],
    ['CPF',                c.cpf    || '—'],
    ['Data de Nascimento', c.dataNasc ? formatarDataBR(c.dataNasc) : '—'],
  ];
  y = renderLinhasTabela(doc, dadosPessoais, ML, y, CW, GRAY_100, GRAY_200, GRAY_700, GRAY_900);

  y += 4;
  y = secaoHeader(doc, 'ENDEREÇO E CONTATO', ML, y, PURPLE, WHITE);
  y += 2;

  const dadosContato = [
    ['Endereço',       c.endereco || '—'],
    ['CEP',            c.cep      || '—'],
    ['Telefone/Whats', c.telefone || '—'],
    ['E-mail',         c.email    || '—'],
  ];
  y = renderLinhasTabela(doc, dadosContato, ML, y, CW, GRAY_100, GRAY_200, GRAY_700, GRAY_900);

  if (c.observacoes) {
    y += 4;
    y = secaoHeader(doc, 'OBSERVAÇÕES', ML, y, [245, 158, 11], WHITE);
    y += 2;
    doc.setFillColor(255, 253, 234);
    doc.roundedRect(ML, y, CW, 18, 2, 2, 'F');
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.4);
    doc.roundedRect(ML, y, CW, 18, 2, 2, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    const lines = doc.splitTextToSize(c.observacoes, CW - 8);
    doc.text(lines, ML + 4, y + 6);
    y += 22;
  }

  const produtos = c.produtos || [];
  y += 4;
  y = secaoHeader(doc, 'PRODUTOS / SERVIÇOS', ML, y, GREEN, WHITE);
  y += 2;

  if (produtos.length === 0) {
    doc.setFillColor(...GRAY_100);
    doc.roundedRect(ML, y, CW, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 160);
    doc.text('Nenhum produto ou serviço cadastrado.', ML + CW / 2, y + 6.5, { align: 'center' });
    y += 14;
  } else {
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(ML, y, CW, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text('#',               ML + 4,       y + 5.2);
    doc.text('Produto/Serviço', ML + 14,      y + 5.2);
    doc.text('Valor (R$)',      ML + CW - 4,  y + 5.2, { align: 'right' });
    y += 8;

    let total = 0;
    produtos.forEach((p, i) => {
      const valNum = parseFloat(p.valor) || 0;
      total += valNum;
      doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
      doc.rect(ML, y, CW, 7, 'F');
      doc.setDrawColor(...GRAY_200);
      doc.setLineWidth(0.2);
      doc.rect(ML, y, CW, 7, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY_700);
      doc.text(`${i + 1}`, ML + 4, y + 4.8);
      doc.text(p.nome || '—', ML + 14, y + 4.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GRAY_900);
      doc.text(`R$ ${valNum.toFixed(2).replace('.', ',')}`, ML + CW - 4, y + 4.8, { align: 'right' });
      y += 7;
    });

    doc.setFillColor(...INDIGO);
    doc.roundedRect(ML, y, CW, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...WHITE);
    doc.text('TOTAL', ML + 4, y + 6);
    doc.text(`R$ ${total.toFixed(2).replace('.', ',')}`, ML + CW - 4, y + 6, { align: 'right' });
    y += 13;
  }

  y += 4;
  y = secaoHeader(doc, 'INFORMAÇÕES DO SISTEMA', ML, y, GRAY_700, WHITE);
  y += 2;

  const dadosSistema = [
    ['ID do Cadastro',       c.id || '—'],
    ['Cadastrado em',        formatarDataHoraBR(c.createdAt)],
    ['Última atualização',   formatarDataHoraBR(c.updatedAt)],
  ];
  y = renderLinhasTabela(doc, dadosSistema, ML, y, CW, GRAY_100, GRAY_200, GRAY_700, GRAY_900);

  const footerY = PH - 20;
  doc.setDrawColor(...GRAY_200);
  doc.setLineWidth(0.4);
  doc.line(ML, footerY - 4, PW - MR, footerY - 4);

  doc.setFillColor(...INDIGO);
  doc.rect(0, PH - 10, PW, 10, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(0, PH - 10, PW, 2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 180, 230);
  doc.text('CPAD ELIM — Sistema de Cadastro de Alunos e Clientes', PW / 2, footerY, { align: 'center' });
  doc.text('Página 1', PW - MR, footerY, { align: 'right' });
  doc.setTextColor(200, 200, 255);
  doc.text('Documento gerado automaticamente pelo sistema.', ML, footerY);

  const nomeArquivo = (c.nome || 'cadastro').replace(/\s+/g, '_').toLowerCase();
  doc.save(`CPAD_ELIM_${nomeArquivo}_${Date.now()}.pdf`);

  pdfCount++;
  localStorage.setItem(LS_PDFS, pdfCount);
  atualizarSummary();
  mostrarToast('PDF gerado com sucesso!', 'success');
}

/* --- Helpers PDF --- */
function secaoHeader(doc, titulo, x, y, bgColor, fgColor) {
  doc.setFillColor(...bgColor);
  doc.roundedRect(x, y, 174, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...fgColor);
  doc.text(titulo, x + 4, y + 5.5);
  return y + 8;
}

function renderLinhasTabela(doc, rows, x, y, w, bg1, bg2, labelColor, valColor) {
  const ROW_H = 8.5;
  rows.forEach((row, i) => {
    doc.setFillColor(...(i % 2 === 0 ? bg1 : [255, 255, 255]));
    doc.rect(x, y, w, ROW_H, 'F');
    doc.setDrawColor(...bg2);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, ROW_H, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...labelColor);
    doc.text(row[0], x + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...valColor);
    const val   = String(row[1] || '—');
    const lines = doc.splitTextToSize(val, w - 80);
    doc.text(lines, x + 60, y + 5.5);

    y += ROW_H;
  });
  return y;
}

/* ========================= FORMATAÇÃO ========================= */
function formatarData(iso) {
  if (!iso) return '—';
  const [yr, mo, dy] = iso.split('-');
  return `${dy}/${mo}/${yr}`;
}

function formatarDataBR(iso) { return formatarData(iso); }

function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatarDataHoraBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/* ========================= TOAST ========================= */
function mostrarToast(msg, tipo = 'success') {
  const toast    = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');

  toast.className = 'toast ' + tipo;

  const icons = { success: 'fa-check-circle', danger: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' };
  toastIcon.className = `fas ${icons[tipo] || 'fa-info-circle'}`;
  toastMsg.textContent = msg;

  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

/* ========================= FECHAR MODAL NO OVERLAY ========================= */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

/* ========================= SHAKE ANIMATION ========================= */
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-6px)}
    40%{transform:translateX(6px)}
    60%{transform:translateX(-4px)}
    80%{transform:translateX(4px)}
  }
  .shake { animation: shake .4s ease !important; border-color: #ef4444 !important; }
`;
document.head.appendChild(style);
