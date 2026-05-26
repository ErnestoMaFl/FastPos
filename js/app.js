// ==========================================
// 1. VARIABLES GLOBALES Y ESTADO
// ==========================================
let productos = [];
let resultadosActuales = [];
let productoSeleccionado = null;
let fuse;
let html5QrCode;
let scannerActivo = false;
let escanerVisible = true;
let tablaVisible = true;
let cambiosPendientes = false; // rastrear si hay ediciones sin guardar
let ticketActual = [];

// Config GitHub (persistida en localStorage)
let ghConfig = {
  user: localStorage.getItem('gh_user') || 'ErnestoMaFl',
  repo: localStorage.getItem('gh_repo') || 'FastPos',
  token: localStorage.getItem('gh_token') || '',
  mostrarRelacion: localStorage.getItem('gh_mostrar_relacion') === 'true'
};

function quitarAcentos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ==========================================
// 2. CARGA DE DATOS (CSV)
// ==========================================
fetch('data/productos.csv')
  .then(res => res.text())
  .then(csv => {
    parsearCSV(csv);
    iniciarEscaner();
    renderizarTabla(productos);
    aplicarColumnaRelacion();
  })
  .catch(err => {
    console.error("Error cargando productos.csv:", err);
    document.getElementById('tabla-contador').textContent = 'Error al cargar productos.csv';
  });

function parsearCSV(csv) {
  const lineas = csv.split('\n');
  const cabeceras = lineas[0].split(',').map(h => h.trim());
  productos = lineas.slice(1).filter(l => l.trim() !== '').map((l, idx) => {
    const vals = l.split(',');
    let obj = {};
    cabeceras.forEach((h, i) => obj[h] = vals[i] ? vals[i].trim() : '');
    obj.SearchKey = quitarAcentos(obj.producto || '');
    obj._id = idx; // id interno para edición
    return obj;
  });
  fuse = new Fuse(productos, {
    keys: ['SearchKey', 'codigo_de_barra'],
    threshold: 0.3,
    distance: 100,
    useExtendedSearch: true
  });
}

// ==========================================
// 3. ESCÁNER DE CÓDIGOS DE BARRAS
// ==========================================
function iniciarEscaner() {
  html5QrCode = new Html5Qrcode("reader");
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 100 },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A
    ]
  };
  html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
    .then(() => { scannerActivo = true; })
    .catch(err => {
      console.error("No se pudo iniciar el escáner:", err);
      document.getElementById('reader-container').style.display = 'none';
    });
}

function onScanSuccess(decodedText) {
  const productoEncontrado = productos.find(p => p.codigo_de_barra === decodedText);
  if (productoEncontrado) {
    if (navigator.vibrate) navigator.vibrate(100);
    abrirCantidadDirecto(productoEncontrado);
  }
}

function toggleScanner(forzarOcultar = false) {
  const container = document.getElementById('reader-container');
  const btn = document.getElementById('toggleScannerBtn');
  if (escanerVisible && (forzarOcultar || !forzarOcultar)) {
    container.style.display = 'none';
    btn.style.opacity = '0.5';
    escanerVisible = false;
    if (scannerActivo && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
      html5QrCode.pause();
    }
  } else if (!forzarOcultar && !escanerVisible) {
    container.style.display = 'block';
    btn.style.opacity = '1';
    escanerVisible = true;
    if (scannerActivo && html5QrCode.getState() === Html5QrcodeScannerState.PAUSED) {
      html5QrCode.resume();
    }
  }
}

// ==========================================
// 4. BÚSQUEDA (TEXTO Y VOZ)
// ==========================================
function filtrar() {
  const inputVal = document.getElementById('busqueda').value;
  if (inputVal.trim() !== '' && escanerVisible) {
    toggleScanner(true);
  }
  if (inputVal.trim() === '' || !fuse) {
    mostrar([]);
    // Tabla muestra todos cuando no hay filtro
    if (tablaVisible) { renderizarTabla(productos); aplicarColumnaRelacion(); }
    return;
  }
  const textoBuscado = quitarAcentos(inputVal);
  resultadosActuales = fuse.search(textoBuscado).map(r => r.item).slice(0, 5);
  mostrar(resultadosActuales);
  // Tabla filtra con el mismo resultado (sin límite de 5)
  if (tablaVisible) {
    const todosResultados = fuse.search(textoBuscado).map(r => r.item);
    renderizarTabla(todosResultados);
  }
}

function mostrar(lista) {
  const div = document.getElementById('resultados');
  if (lista.length === 0) {
    div.innerHTML = '';
    return;
  }
  div.innerHTML = lista.map((p, index) =>
    `<div class="producto" onclick="abrirCantidad(${index})">
      <div class="nombre-box">
        <span class="nombre">${p.producto || 'N/A'}</span>
        <span class="codigo-txt">${p.codigo_de_barra || ''}</span>
      </div>
      <span class="precio">$${p.precio || '0.00'}</span>
    </div>`
  ).join('');
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { alert("Tu navegador no soporta voz."); return; }
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-MX';
  recognition.interimResults = false;
  const btn = document.getElementById('micBtn');
  btn.style.background = '#16a34a';
  recognition.onresult = event => {
    document.getElementById('busqueda').value = event.results[0][0].transcript;
    btn.style.background = '#e11d48';
    filtrar();
  };
  recognition.onerror = () => btn.style.background = '#e11d48';
  recognition.onend = () => btn.style.background = '#e11d48';
  recognition.start();
}

// ==========================================
// 5. FLUJO DE SELECCIÓN Y CANTIDAD
// ==========================================
function limpiarPrecio(precioStr) {
  if (!precioStr) return 0;
  return parseFloat(precioStr.replace(/[^0-9.-]+/g, "")) || 0;
}

function abrirCantidad(index) {
  abrirCantidadDirecto(resultadosActuales[index]);
}

function abrirCantidadDirecto(producto) {
  productoSeleccionado = producto;
  if (scannerActivo && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
    html5QrCode.pause();
  }
  document.getElementById('pantalla-busqueda').style.display = 'none';
  document.getElementById('pantalla-cantidad').style.display = 'block';
  document.getElementById('selNombre').innerText = productoSeleccionado.producto || 'N/A';
  document.getElementById('selPrecio').innerText = `$${productoSeleccionado.precio || '0.00'} x unidad`;
  const inputCant = document.getElementById('inputCantidad');
  inputCant.value = '1';
  calcularTotal();
  setTimeout(() => { inputCant.focus(); inputCant.select(); }, 50);
}

function calcularTotal() {
  if (!productoSeleccionado) return;
  const cant = parseFloat(document.getElementById('inputCantidad').value) || 0;
  const precioNum = limpiarPrecio(productoSeleccionado.precio);
  document.getElementById('selTotal').innerText = `$${(cant * precioNum).toFixed(2)}`;
}

function volverBusqueda() {
  document.getElementById('pantalla-cantidad').style.display = 'none';
  document.getElementById('pantalla-busqueda').style.display = 'block';
  const searchInput = document.getElementById('busqueda');
  searchInput.value = '';
  mostrar([]);
  if (tablaVisible) { renderizarTabla(productos); aplicarColumnaRelacion(); }
  if (escanerVisible && scannerActivo && html5QrCode.getState() === Html5QrcodeScannerState.PAUSED) {
    html5QrCode.resume();
  }
}

function confirmar(event) {
  event.preventDefault();
  console.log("Producto a agregar:", productoSeleccionado.producto, "Cantidad:", document.getElementById('inputCantidad').value);
  volverBusqueda();
}

// ==========================================
// 6. TABLA DE PRODUCTOS (NUEVA FUNCIONALIDAD)
// ==========================================
function toggleTabla() {
  const contenedor = document.getElementById('contenedor-tabla');
  const btn = document.getElementById('btnTabla');
  tablaVisible = !tablaVisible;
  contenedor.style.display = tablaVisible ? 'block' : 'none';
  btn.classList.toggle('activo', tablaVisible);
}

function renderizarTabla(lista) {
  const tbody = document.getElementById('tabla-body');
  const contador = document.getElementById('tabla-contador');
  contador.textContent = `${lista.length} productos`;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b;">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr data-id="${p._id}" class="fila-producto">
      <td class="col-codigo">
        <span class="celda-texto" onclick="editarCelda(this)">${p.codigo_de_barra || ''}</span>
      </td>
      <td class="col-nombre">
        <span class="celda-texto" onclick="editarCelda(this)">${p.producto || ''}</span>
      </td>
      <td class="col-precio">
        <span class="celda-texto precio-celda" onclick="editarCelda(this)">${p.precio || ''}</span>
      </td>
      <td class="col-relacion">
        <span class="celda-texto" onclick="editarCelda(this)">${p.relacion || ''}</span>
      </td>
      <td class="col-acciones">
        <button class="btn-fila-eliminar" onclick="eliminarFila(${p._id})" title="Eliminar">🗑</button>
      </td>
    </tr>
  `).join('');
}

function editarCelda(span) {
  if (span.querySelector('input')) return; // ya está editando
  const valorActual = span.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = valorActual;
  input.className = 'input-celda';

  // Al confirmar (Enter o blur)
  const guardar = () => {
    const nuevoValor = input.value.trim();
    span.textContent = nuevoValor;
    // Actualizar en el arreglo productos
    const tr = span.closest('tr');
    const id = parseInt(tr.dataset.id);
    const prod = productos.find(p => p._id === id);
    if (prod) {
      // Detectar columna por clase del td
      const td = span.closest('td');
      if (td.classList.contains('col-codigo')) prod.codigo_de_barra = nuevoValor;
      else if (td.classList.contains('col-nombre')) {
        prod.producto = nuevoValor;
        prod.SearchKey = quitarAcentos(nuevoValor);
      }
      else if (td.classList.contains('col-precio')) prod.precio = nuevoValor;
      else if (td.classList.contains('col-relacion')) prod.relacion = nuevoValor;
      // Marcar cambios pendientes
      marcarCambios();
      // Reconstruir fuse con datos actualizados
      reconstruirFuse();
    }
    tr.classList.add('fila-modificada');
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { span.textContent = valorActual; }
  });
  input.addEventListener('blur', guardar);

  span.textContent = '';
  span.appendChild(input);
  input.focus();
  input.select();
}

function eliminarFila(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  productos = productos.filter(p => p._id !== id);
  reconstruirFuse();
  marcarCambios();
  filtrar(); // re-renderiza con el filtro actual
}

function agregarFilaNueva() {
  const maxId = productos.reduce((max, p) => Math.max(max, p._id || 0), 0);
  const nuevo = {
    _id: maxId + 1,
    codigo_de_barra: '',
    producto: 'Nuevo producto',
    precio: '0',
    revisar: '0',
    relacion: '',
    SearchKey: 'nuevo producto'
  };
  productos.push(nuevo);
  reconstruirFuse();
  marcarCambios();
  // Ir al final de la tabla
  const inputFiltro = document.getElementById('busqueda').value;
  if (!inputFiltro.trim()) renderizarTabla(productos);
  // Scroll al final
  setTimeout(() => {
    const tabla = document.getElementById('contenedor-tabla');
    tabla.scrollTop = tabla.scrollHeight;
    // Activar edición del nombre en la última fila
    const filas = document.querySelectorAll('#tabla-body tr');
    if (filas.length > 0) {
      const ultima = filas[filas.length - 1];
      const spanNombre = ultima.querySelector('.col-nombre .celda-texto');
      if (spanNombre) editarCelda(spanNombre);
    }
  }, 50);
}

function reconstruirFuse() {
  fuse = new Fuse(productos, {
    keys: ['SearchKey', 'codigo_de_barra'],
    threshold: 0.3,
    distance: 100,
    useExtendedSearch: true
  });
}

function marcarCambios() {
  cambiosPendientes = true;
  const btnGuardar = document.getElementById('btn-guardar-csv');
  if (ghConfig.token) {
    btnGuardar.style.display = 'inline-flex';
  }
  btnGuardar.classList.add('tiene-cambios');
}

// ==========================================
// 7. EXPORTAR / GUARDAR CSV EN GITHUB
// ==========================================
function productosACSV() {
  const cabeceras = ['codigo_de_barra', 'producto', 'precio', 'revisar', 'relacion'];
  const filas = productos.map(p =>
    cabeceras.map(h => (p[h] !== undefined ? p[h] : '')).join(',')
  );
  return cabeceras.join(',') + '\n' + filas.join('\n');
}

async function guardarCSVEnGithub() {
  if (!ghConfig.token) {
    abrirModalGithub();
    return;
  }
  const csvContent = productosACSV();
  const btn = document.getElementById('btn-guardar-csv');
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    // 1. Obtener SHA del archivo actual
    const getRes = await fetch(
      `https://api.github.com/repos/${ghConfig.user}/${ghConfig.repo}/contents/data/productos.csv`,
      { headers: { Authorization: `Bearer ${ghConfig.token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    const getData = await getRes.json();
    const sha = getData.sha;

    // 2. Codificar en base64
    const base64Content = btoa(unescape(encodeURIComponent(csvContent)));

    // 3. PUT para actualizar
    const putRes = await fetch(
      `https://api.github.com/repos/${ghConfig.user}/${ghConfig.repo}/contents/data/productos.csv`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ghConfig.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `POS: actualizar productos.csv ${new Date().toLocaleString('es-MX')}`,
          content: base64Content,
          sha: sha
        })
      }
    );

    if (putRes.ok) {
      btn.textContent = '✅ Guardado';
      btn.classList.remove('tiene-cambios');
      cambiosPendientes = false;
      setTimeout(() => {
        btn.textContent = '💾 Guardar en GitHub';
        btn.disabled = false;
      }, 2500);
    } else {
      const err = await putRes.json();
      throw new Error(err.message || 'Error al guardar');
    }
  } catch (error) {
    console.error('Error GitHub:', error);
    btn.textContent = '❌ Error: ' + error.message;
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = '💾 Guardar en GitHub';
    }, 3000);
  }
}

// ==========================================
// 8. MODAL CONFIG GITHUB
// ==========================================
function abrirModalGithub() {
  document.getElementById('gh-user').value = ghConfig.user;
  document.getElementById('gh-repo').value = ghConfig.repo;
  document.getElementById('gh-token').value = ghConfig.token;
  document.getElementById('gh-mostrar-relacion').checked = ghConfig.mostrarRelacion;
  document.getElementById('modal-github').style.display = 'flex';
}

function cerrarModalGithub() {
  document.getElementById('modal-github').style.display = 'none';
}

function guardarConfigGithub() {
  ghConfig.user = document.getElementById('gh-user').value.trim();
  ghConfig.repo = document.getElementById('gh-repo').value.trim();
  ghConfig.token = document.getElementById('gh-token').value.trim();
  ghConfig.mostrarRelacion = document.getElementById('gh-mostrar-relacion').checked;
  localStorage.setItem('gh_user', ghConfig.user);
  localStorage.setItem('gh_repo', ghConfig.repo);
  localStorage.setItem('gh_token', ghConfig.token);
  localStorage.setItem('gh_mostrar_relacion', ghConfig.mostrarRelacion);
  cerrarModalGithub();
  // Mostrar botón guardar si hay token
  if (ghConfig.token) {
    document.getElementById('btn-guardar-csv').style.display = 'inline-flex';
  }
}

// ==========================================
// TOGGLE COLUMNA RELACIÓN
// ==========================================
function toggleColumnaRelacion(mostrar) {
  ghConfig.mostrarRelacion = mostrar;
  localStorage.setItem('gh_mostrar_relacion', mostrar);
  const celdas = document.querySelectorAll('.col-relacion');
  celdas.forEach(c => c.style.display = mostrar ? '' : 'none');
}

function aplicarColumnaRelacion() {
  const celdas = document.querySelectorAll('.col-relacion');
  celdas.forEach(c => c.style.display = ghConfig.mostrarRelacion ? '' : 'none');
}

// ==========================================
// 9. AUTO-VERSIONADO
// ==========================================
function checarVersionGithub() {
  const githubUser = ghConfig.user;
  const githubRepo = ghConfig.repo;
  fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/commits/main`)
    .then(response => response.json())
    .then(data => {
      const hash = data.sha.substring(0, 7);
      const fecha = new Date(data.commit.author.date).toLocaleString('es-MX');
      document.getElementById('footer-version').innerText = `App Version: rev-${hash} (${fecha})`;
    })
    .catch(() => {
      document.getElementById('footer-version').innerText = `App Version: Local / Desconectado`;
    });
}

checarVersionGithub();

// Mostrar botón si ya hay token guardado
if (ghConfig.token) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-guardar-csv').style.display = 'inline-flex';
  });
}