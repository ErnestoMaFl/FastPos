// ==========================================
// 1. VARIABLES GLOBALES Y ESTADO DE LA APP
// ==========================================
let productos = [];
let resultadosActuales = [];
let productoSeleccionado = null;
let fuse;
let html5QrCode;
let scannerActivo = false;
let escanerVisible = true;

// Preparación para la siguiente fase: El Carrito
let ticketActual = []; 

function quitarAcentos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ==========================================
// 2. CARGA DE DATOS (CSV)
// ==========================================
// Atención: La ruta ahora apunta a la carpeta data/
fetch('data/productos.csv')
  .then(res => res.text())
  .then(csv => {
    const lineas = csv.split('\n');
    const cabeceras = lineas[0].split(',').map(h => h.trim());
    
    productos = lineas.slice(1).filter(l => l.trim() !== '').map(l => {
      const vals = l.split(',');
      let obj = {};
      cabeceras.forEach((h, i) => obj[h] = vals[i] ? vals[i].trim() : '');
      obj.SearchKey = quitarAcentos(obj.Producto || '');
      return obj;
    });

    fuse = new Fuse(productos, {
      keys: ['SearchKey', 'Codigo'],
      threshold: 0.3, 
      distance: 100,
      useExtendedSearch: true
    });

    iniciarEscaner();
  })
  .catch(err => console.error("Error cargando productos.csv:", err));


// ==========================================
// 3. ESCÁNER DE CÓDIGOS DE BARRAS
// ==========================================
function iniciarEscaner() {
  html5QrCode = new Html5Qrcode("reader");
  
  const config = { 
    fps: 10,
    // Tamaño fijo de 250x100. Cabe perfecto en la pantalla del móvil sin reventar el cálculo interno.
    qrbox: { width: 250, height: 100 }, 
    // Optimizador: Le decimos que NO busque QR ni formatos raros, SOLO códigos de barras (EAN_13 es el de 13 dígitos de México)
    formatsToSupport: [ 
      Html5QrcodeSupportedFormats.EAN_13, 
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A
    ]
  };
  
  // No usamos aspectRatio. Dejamos que la cámara use su formato nativo.
  html5QrCode.start(
    { facingMode: "environment" }, 
    config, 
    onScanSuccess
  ).then(() => { 
    scannerActivo = true; 
  }).catch(err => {
    console.error("No se pudo iniciar el escáner:", err);
    document.getElementById('reader-container').style.display = 'none';
  });
}

function onScanSuccess(decodedText) {
  const productoEncontrado = productos.find(p => p.Codigo === decodedText);
  
  if (productoEncontrado) {
    if (navigator.vibrate) navigator.vibrate(100); 
    abrirCantidadDirecto(productoEncontrado);
  }
}

function toggleScanner(forzarOcultar = false) {
  const container = document.getElementById('reader-container');
  const btn = document.getElementById('toggleScannerBtn');

  // Si está visible y queremos ocultarlo (ya sea por el botón o forzado por teclear)
  if (escanerVisible && (forzarOcultar || !forzarOcultar)) {
    container.style.display = 'none';
    btn.style.opacity = '0.5'; // Efecto visual de apagado
    escanerVisible = false;
    
    // Pausamos la cámara si está escaneando
    if (scannerActivo && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
      html5QrCode.pause();
    }
  } 
  // Si está oculto y el usuario apretó el botón para mostrarlo
  else if (!forzarOcultar && !escanerVisible) {
    container.style.display = 'block';
    btn.style.opacity = '1'; // Efecto visual de encendido
    escanerVisible = true;
    
    // Reanudamos la cámara si estaba pausada
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
    return;
  }

  const textoBuscado = quitarAcentos(inputVal);
  resultadosActuales = fuse.search(textoBuscado).map(r => r.item).slice(0, 5);
  mostrar(resultadosActuales);
}

function mostrar(lista) {
  const div = document.getElementById('resultados');
  if (lista.length === 0) {
    div.innerHTML = '<div class="producto" style="color:#666; justify-content:center;">Sin resultados</div>';
    return;
  }
  
  div.innerHTML = lista.map((p, index) =>
    `<div class="producto" onclick="abrirCantidad(${index})">
      <div class="nombre-box">
        <span class="nombre">${p.Producto || 'N/A'}</span>
        <span class="codigo-txt">${p.Codigo || ''}</span>
      </div>
      <span class="precio">$${p.Precio || '0.00'}</span>
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
  return parseFloat(precioStr.replace(/[^0-9.-]+/g,"")) || 0;
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

  document.getElementById('selNombre').innerText = productoSeleccionado.Producto || 'N/A';
  document.getElementById('selPrecio').innerText = `$${productoSeleccionado.Precio || '0.00'} x unidad`;

  const inputCant = document.getElementById('inputCantidad');
  inputCant.value = '1';
  calcularTotal();

  setTimeout(() => {
    inputCant.focus();
    inputCant.select();
  }, 50); 
}

function calcularTotal() {
  if (!productoSeleccionado) return;
  const cant = parseFloat(document.getElementById('inputCantidad').value) || 0;
  const precioNum = limpiarPrecio(productoSeleccionado.Precio);
  document.getElementById('selTotal').innerText = `$${(cant * precioNum).toFixed(2)}`;
}

function volverBusqueda() {
  document.getElementById('pantalla-cantidad').style.display = 'none';
  document.getElementById('pantalla-busqueda').style.display = 'block';
  
  const searchInput = document.getElementById('busqueda');
  searchInput.value = ''; 
  mostrar([]); 
  
  if (scannerActivo && html5QrCode.getState() === Html5QrcodeScannerState.PAUSED) {
    html5QrCode.resume();
  }
}


// ==========================================
// 6. FLUJO DEL CARRITO (Próximamente)
// ==========================================
function confirmar(event) {
  event.preventDefault(); 
  
  // Aquí insertaremos la lógica para empujar el productoSeleccionado y su cantidad al "ticketActual"
  console.log("Producto a agregar:", productoSeleccionado.Producto, "Cantidad:", document.getElementById('inputCantidad').value);

  volverBusqueda();
}

// ==========================================
// 7. AUTO-VERSIONADO (VERIFICADOR DE GITHUB PAGES)
// ==========================================
function checarVersionGithub() {
  // CAMBIA ESTO por tus datos reales de GitHub
  const githubUser = 'ErnestoMaFl'; 
  const githubRepo = 'FastPos';
  
  fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/commits/main`)
    .then(response => response.json())
    .then(data => {
      // Tomamos los primeros 7 caracteres del hash del commit
      const hash = data.sha.substring(0, 7);
      // Tomamos la fecha exacta del commit y la formateamos
      const fecha = new Date(data.commit.author.date).toLocaleString('es-MX');
      
      document.getElementById('footer-version').innerText = `App Version: rev-${hash} (${fecha})`;
    })
    .catch(error => {
      console.error("Error al obtener la versión de GitHub:", error);
      document.getElementById('footer-version').innerText = `App Version: Local / Desconectado`;
    });
}

// Ejecutamos la validación en cuanto cargue el script
checarVersionGithub();