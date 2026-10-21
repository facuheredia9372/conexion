const FILAS = 10;
const COLUMNAS = 10;
const TIEMPO_TURNO = 30;
const OBJETIVO_CASAS = 3;

const DIRECCIONES = ["norte", "sur", "este", "oeste"];
const TEXTO_DIRECCION = {
    norte: "hacia arriba",
    sur: "hacia abajo",
    este: "hacia la derecha",
    oeste: "hacia la izquierda"
};

// Giro de color (en grados) sobre la imagen roja del caballero
const GIRO_COLORES = {
    rojo: 0,
    azul: 200,
    verde: 135,
    amarillo: 50
};

let casas = [];
let configuracion = {
    modo: "pve",
    dificultad: "medio",
    colorJ1: "azul",
    colorJ2: "rojo",
    nombreJ1: "Jugador 1",
    nombreJ2: "Jugador 2"
};

let fichas = [];
let contadorFichas = 1;

let turnoActual = 1;
let rondaActual = 1;
let totalMovimientos = 0;
let tiempoInicioPartida = null;

let dadoTirado = false;
let numeroDado = null;
let fichaSeleccionada = null;

let fichasPendientesDeMover = [];

let temporizador = null;
let tiempoRestante = TIEMPO_TURNO;

let idPartida = 0;
let partidaActiva = false;
let turnoBloqueado = false;
let timeoutSiguienteTurno = null;
let intervaloDado = null;
let conquistas = { 1: 0, 2: 0 };

let animacionMovimiento = null;
let fichaNuevaId = null;
let casillaConquistada = null;

const TIEMPO_ESPERA_BOT = 10000;
const TIEMPO_CONEXION_BOT = 45000;
let urlBot = localStorage.getItem("urlBot") || "";
let solicitudBot = 0;
let esperandoBot = false;
let botonBotMenu = null;
let botonBotEncabezado = null;

// Ejecuta la función más tarde, solo si sigue la misma partida y está activa
function despues(ms, funcion) {
    const id = idPartida;
    return setTimeout(() => {
        if (id === idPartida && partidaActiva) funcion();
    }, ms);
}

const Sonido = (() => {
    let ctx = null;
    let bufferRuido = null;
    let activo = localStorage.getItem("sonido") !== "no";

    function obtenerContexto() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    function obtenerRuido(c) {
        if (!bufferRuido) {
            bufferRuido = c.createBuffer(1, c.sampleRate, c.sampleRate);
            const datos = bufferRuido.getChannelData(0);
            for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
        }
        return bufferRuido;
    }

    function tono({ freq, freqFin, tipo = "sine", inicio = 0, dur = 0.15, vol = 0.2 }) {
        const c = obtenerContexto();
        if (!c || !activo) return;
        const t0 = c.currentTime + inicio;
        const osc = c.createOscillator();
        const ganancia = c.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqFin) osc.frequency.exponentialRampToValueAtTime(freqFin, t0 + dur);
        ganancia.gain.setValueAtTime(0.0001, t0);
        ganancia.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(ganancia).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }

    function ruido({ inicio = 0, dur = 0.05, vol = 0.2, freq = 1500, q = 1, tipoFiltro = "bandpass" }) {
        const c = obtenerContexto();
        if (!c || !activo) return;
        const t0 = c.currentTime + inicio;
        const fuente = c.createBufferSource();
        fuente.buffer = obtenerRuido(c);
        const filtro = c.createBiquadFilter();
        filtro.type = tipoFiltro;
        filtro.frequency.value = freq;
        filtro.Q.value = q;
        const ganancia = c.createGain();
        ganancia.gain.setValueAtTime(vol, t0);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        fuente.connect(filtro).connect(ganancia).connect(c.destination);
        fuente.start(t0, Math.random() * 0.5);
        fuente.stop(t0 + dur + 0.02);
    }

    return {
        dado() {
            let t = 0;
            for (let i = 0; i < 9; i++) {
                ruido({
                    inicio: t,
                    dur: 0.04,
                    vol: 0.28 - i * 0.02,
                    freq: 1400 + Math.random() * 1600,
                    q: 2.5
                });
                t += 0.035 + i * 0.012;
            }
            tono({ freq: 150, freqFin: 70, tipo: "triangle", inicio: t, dur: 0.12, vol: 0.28 });
        },

        mover() {
            tono({ freq: 260, freqFin: 90, tipo: "sine", dur: 0.13, vol: 0.4 });
            ruido({ dur: 0.04, vol: 0.22, freq: 2200, q: 1.2 });
        },

        conquista() {
            const notas = [523.25, 659.25, 783.99, 1046.5];
            notas.forEach((f, i) => {
                tono({ freq: f, tipo: "triangle", inicio: i * 0.09, dur: 0.28, vol: 0.22 });
            });
            tono({ freq: 1318.5, tipo: "sine", inicio: 0.36, dur: 0.9, vol: 0.16 });
            tono({ freq: 2637, tipo: "sine", inicio: 0.36, dur: 0.5, vol: 0.05 });
        },

        error() {
            tono({ freq: 190, freqFin: 110, tipo: "sawtooth", dur: 0.22, vol: 0.13 });
            tono({ freq: 150, freqFin: 90, tipo: "square", inicio: 0.09, dur: 0.22, vol: 0.08 });
        },

        victoria() {
            const secuencia = [
                [523.25, 0], [523.25, 0.14], [523.25, 0.28],
                [659.25, 0.45], [783.99, 0.62], [1046.5, 0.85]
            ];
            secuencia.forEach(([f, t]) => {
                tono({ freq: f, tipo: "square", inicio: t, dur: 0.3, vol: 0.1 });
                tono({ freq: f / 2, tipo: "triangle", inicio: t, dur: 0.3, vol: 0.15 });
            });
        },

        click() {
            tono({ freq: 660, freqFin: 880, tipo: "triangle", dur: 0.1, vol: 0.18 });
        },

        // Los navegadores exigen un click para activar el audio
        preparar() {
            obtenerContexto();
        },

        alternar() {
            activo = !activo;
            localStorage.setItem("sonido", activo ? "si" : "no");
            if (activo) this.click();
            return activo;
        },

        estaActivo() {
            return activo;
        }
    };
})();

function mostrarMensaje(titulo, texto, tipo = "error") {
    let contenedor = document.getElementById("contenedor-mensajes");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "contenedor-mensajes";
        document.body.appendChild(contenedor);
    }

    const clave = `${tipo}|${titulo}|${texto}`;
    if ([...contenedor.children].some(hijo => hijo.dataset.clave === clave)) return;

    while (contenedor.children.length >= 3) contenedor.firstChild.remove();

    const iconos = { error: "⛔", aviso: "⚠️", info: "ℹ️", exito: "🏰" };

    const cartel = document.createElement("div");
    cartel.className = `mensaje mensaje-${tipo}`;
    cartel.dataset.clave = clave;
    cartel.setAttribute("role", tipo === "error" ? "alert" : "status");

    const icono = document.createElement("span");
    icono.className = "mensaje-icono";
    icono.textContent = iconos[tipo] || iconos.info;

    const cuerpo = document.createElement("div");
    cuerpo.className = "mensaje-texto";
    const strong = document.createElement("strong");
    strong.textContent = titulo;
    const detalle = document.createElement("span");
    detalle.textContent = texto;
    cuerpo.append(strong, detalle);

    cartel.append(icono, cuerpo);

    const cerrar = () => {
        cartel.classList.add("saliendo");
        setTimeout(() => cartel.remove(), 300);
    };
    cartel.addEventListener("click", cerrar);
    setTimeout(cerrar, tipo === "error" ? 4500 : 3500);

    contenedor.appendChild(cartel);

    if (tipo === "error") Sonido.error();
}

function sacudirTablero() {
    const tablero = document.getElementById("tablero");
    if (!tablero) return;
    tablero.classList.remove("tablero-error");
    void tablero.offsetWidth;
    tablero.classList.add("tablero-error");
}

// Dos capas: .ficha-jugador (tamaño, sombra, click) y .ficha-imagen (lleva el filtro de color)
function crearElementoFicha(color) {
    const elemento = document.createElement("div");
    elemento.classList.add("ficha-jugador");

    const imagen = document.createElement("div");
    imagen.classList.add("ficha-imagen");
    const giro = GIRO_COLORES[String(color).toLowerCase()] ?? 0;
    imagen.style.setProperty("--giro", `${giro}deg`);

    elemento.appendChild(imagen);
    return elemento;
}

function crearElementoCastillo() {
    const elemento = document.createElement("div");
    elemento.classList.add("casa-castillo");
    return elemento;
}

function nombreJugador(numero) {
    const elemento = document.getElementById(`nombre-j${numero}`);
    return elemento ? elemento.textContent : `Jugador ${numero}`;
}

function nombreCasilla(fila, columna) {
    return String.fromCharCode(65 + columna) + (fila + 1);
}

function fichaEn(fila, columna) {
    return fichas.find(f => f.activa && f.fila === fila && f.columna === columna) || null;
}

function hayCasaEn(fila, columna) {
    return casas.some(c => c.fila === fila && c.columna === columna);
}

function obtenerMovimientosValidos(ficha, pasos) {
    const validos = [];
    for (const direccion of DIRECCIONES) {
        const destino = calcularNuevaPosicion(ficha.fila, ficha.columna, direccion, pasos);
        if (!fichaEn(destino.fila, destino.columna)) {
            validos.push({ direccion, destino });
        }
    }
    return validos;
}

function hayMovimientosDisponibles() {
    return fichas
        .filter(f => fichasPendientesDeMover.includes(f.id))
        .some(f => obtenerMovimientosValidos(f, numeroDado).length > 0);
}

// Casilla libre más cercana a la casa conquistada: prefiere las 4 de al lado y evita los castillos
function buscarCasillaLibreParaClon(fila, columna) {
    let mejores = [];
    let mejorDistancia = Infinity;

    for (let f = 0; f < FILAS; f++) {
        for (let c = 0; c < COLUMNAS; c++) {
            if (fichaEn(f, c) || hayCasaEn(f, c)) continue;

            const distancia = calcularDistanciaCilindrica(f, c, fila, columna);
            if (distancia < mejorDistancia) {
                mejorDistancia = distancia;
                mejores = [{ fila: f, columna: c }];
            } else if (distancia === mejorDistancia) {
                mejores.push({ fila: f, columna: c });
            }
        }
    }

    if (mejores.length === 0) return null;
    return mejores[Math.floor(Math.random() * mejores.length)];
}

function reiniciarPartida() {
    idPartida++;
    cancelarSolicitudBot();
    clearTimeout(timeoutSiguienteTurno);
    clearInterval(intervaloDado);
    timeoutSiguienteTurno = null;

    casas = [
        { id: 1, fila: 1, columna: 2 },
        { id: 2, fila: 2, columna: 7 },
        { id: 3, fila: 5, columna: 4 },
        { id: 4, fila: 7, columna: 1 },
        { id: 5, fila: 8, columna: 8 }
    ];

    const contenedor = document.getElementById("historial-movimientos");
    if (contenedor) {
        contenedor.innerHTML = '<p class="sin-movimientos">Todavía no hay movimientos.</p>';
    }

    fichas = [
        { id: `f-${contadorFichas++}`, jugador: 1, fila: 0, columna: 0, color: configuracion.colorJ1, activa: true },
        { id: `f-${contadorFichas++}`, jugador: 2, fila: 9, columna: 9, color: configuracion.colorJ2, activa: true }
    ];

    turnoActual = 1;
    rondaActual = 1;
    totalMovimientos = 0;
    tiempoInicioPartida = new Date();
    conquistas = { 1: 0, 2: 0 };
    partidaActiva = true;
    turnoBloqueado = false;
    animacionMovimiento = null;
    fichaNuevaId = null;
    casillaConquistada = null;

    dadoTirado = false;
    numeroDado = null;
    fichaSeleccionada = null;
    fichasPendientesDeMover = [];

    document.getElementById("casas-j1").textContent = "0";
    document.getElementById("casas-j2").textContent = "0";

    const barraJ1 = document.getElementById("barra-j1");
    const barraJ2 = document.getElementById("barra-j2");

    barraJ1.className = `jugador-color color-bg-${configuracion.colorJ1}`;
    barraJ2.className = `jugador-color color-bg-${configuracion.colorJ2}`;

    let nombreFinalJ1 = configuracion.nombreJ1 || "Jugador 1";
    let nombreFinalJ2 = configuracion.nombreJ2 || "Jugador 2";

    if (configuracion.modo === "eve") {
        nombreFinalJ1 = "Bot 1";
        nombreFinalJ2 = "Bot 2";
    } else if (configuracion.modo === "pve") {
        nombreFinalJ2 = "Bot 2";
    }

    document.getElementById("nombre-j1").textContent = nombreFinalJ1;
    document.getElementById("nombre-j2").textContent = nombreFinalJ2;

    const dadoCentral = document.getElementById("dado-central");
    if (dadoCentral) dadoCentral.textContent = "🎲";

    actualizarInterfaz();
    iniciarTemporizador();
    comprobarTurnoBot();
}

function crearTablero() {
    const tablero = document.getElementById("tablero");
    if (!tablero) return;

    tablero.innerHTML = "";

    const destinos = {};
    if (
        fichaSeleccionada && dadoTirado && !turnoBloqueado && esTurnoHumano() &&
        fichasPendientesDeMover.includes(fichaSeleccionada.id)
    ) {
        for (const direccion of DIRECCIONES) {
            const d = calcularNuevaPosicion(fichaSeleccionada.fila, fichaSeleccionada.columna, direccion, numeroDado);
            destinos[`${d.fila}-${d.columna}`] = fichaEn(d.fila, d.columna) ? "destino-ocupado" : "destino-valido";
        }
    }

    for (let fila = 0; fila < FILAS; fila++) {
        for (let columna = 0; columna < COLUMNAS; columna++) {
            const casilla = document.createElement("div");
            casilla.classList.add("casilla");

            casilla.dataset.fila = fila;
            casilla.dataset.columna = columna;

            const casa = casas.find(c => c.fila === fila && c.columna === columna);
            const ficha = fichaEn(fila, columna);

            const claseDestino = destinos[`${fila}-${columna}`];
            if (claseDestino) casilla.classList.add(claseDestino);

            if (casillaConquistada && casillaConquistada.fila === fila && casillaConquistada.columna === columna) {
                casilla.classList.add("conquista-flash");
            }

            if (ficha) {
                const elemento = crearElementoFicha(ficha.color);
                elemento.dataset.fichaId = ficha.id;
                casilla.classList.add("tiene-ficha");

                if (fichaSeleccionada && fichaSeleccionada.id === ficha.id) {
                    elemento.classList.add("ficha-seleccionada");
                    casilla.classList.add("casilla-seleccionada");
                }

                if (fichaNuevaId === ficha.id) {
                    elemento.classList.add("ficha-nueva");
                }

                casilla.appendChild(elemento);
            } else if (casa) {
                casilla.appendChild(crearElementoCastillo());
            }

            casilla.addEventListener("click", () => {
                if (ficha && verificarTurnoHumano()) seleccionarFicha(ficha);
            });

            tablero.appendChild(casilla);
        }
    }

    ejecutarAnimacionMovimiento(tablero);

    fichaNuevaId = null;
    casillaConquistada = null;
}

function capturarPosicionFicha(id) {
    const elemento = document.querySelector(`.ficha-jugador[data-ficha-id="${id}"]`);
    if (!elemento) return null;
    const r = elemento.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function ejecutarAnimacionMovimiento(tablero) {
    if (!animacionMovimiento) return;

    const { id, antes } = animacionMovimiento;
    animacionMovimiento = null;
    if (!antes) return;

    const elemento = tablero.querySelector(`.ficha-jugador[data-ficha-id="${id}"]`);
    if (!elemento || !elemento.animate) return;

    const r = elemento.getBoundingClientRect();
    const dx = antes.x - (r.left + r.width / 2);
    const dy = antes.y - (r.top + r.height / 2);
    const tamCasilla = tablero.clientWidth / COLUMNAS;

    // Se sube la casilla para que la animación no quede tapada por las vecinas
    const casilla = elemento.parentElement;
    casilla.style.zIndex = "8";
    const restaurar = () => { casilla.style.zIndex = ""; };

    let animacion;
    if (Math.abs(dx) > tamCasilla * 3.6 || Math.abs(dy) > tamCasilla * 3.6) {
        // Cruzó el borde del tablero: aparece con un pequeño "pop"
        animacion = elemento.animate(
            [
                { transform: "scale(0.3)", opacity: 0 },
                { transform: "scale(1.15)", opacity: 1, offset: 0.65 },
                { transform: "scale(1)", opacity: 1 }
            ],
            { duration: 380, easing: "ease-out" }
        );
    } else {
        animacion = elemento.animate(
            [
                { transform: `translate(${dx}px, ${dy}px) scale(1)` },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 10}px) scale(1.12)`, offset: 0.5 },
                { transform: "translate(0, 0) scale(1)" }
            ],
            { duration: 360, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" }
        );
    }

    animacion.onfinish = restaurar;
    animacion.oncancel = restaurar;
}

function esTurnoHumano() {
    if (configuracion.modo === "eve") return false;
    if (configuracion.modo === "pve" && turnoActual === 2) return false;
    return true;
}

function verificarTurnoHumano() {
    if (!partidaActiva || turnoBloqueado) return false;
    if (esTurnoHumano()) return true;

    mostrarMensaje(
        "Turno del bot",
        `Está jugando ${nombreJugador(turnoActual)}. Esperá a que termine su jugada.`,
        "info"
    );
    return false;
}

function seleccionarFicha(ficha) {
    if (ficha.jugador !== turnoActual) {
        mostrarMensaje(
            "Esa ficha no es tuya",
            `Pertenece a ${nombreJugador(ficha.jugador)}. Ahora juega ${nombreJugador(turnoActual)}: elegí una de tus fichas.`,
            "error"
        );
        return;
    }

    if (dadoTirado && !fichasPendientesDeMover.includes(ficha.id)) {
        mostrarMensaje(
            "Esa ficha ya se movió",
            "Cada ficha se mueve una sola vez por turno. Elegí otra que todavía no haya jugado.",
            "error"
        );
        return;
    }

    if (fichaSeleccionada && fichaSeleccionada.id === ficha.id) {
        fichaSeleccionada = null;
    } else {
        fichaSeleccionada = ficha;
    }

    crearTablero();
}

function animarNumeroDado(final) {
    clearInterval(intervaloDado);

    const dadoCentral = document.getElementById("dado-central");
    const elDado = document.getElementById("dado");
    let vueltas = 0;

    intervaloDado = setInterval(() => {
        vueltas++;
        const valor = vueltas >= 7 ? final : Math.floor(Math.random() * 3) + 1;
        if (dadoCentral) dadoCentral.textContent = valor;
        if (elDado) elDado.textContent = valor;
        if (vueltas >= 7) clearInterval(intervaloDado);
    }, 65);
}

function tirarDado() {
    if (!partidaActiva || turnoBloqueado) return;

    if (dadoTirado) {
        if (esTurnoHumano()) {
            mostrarMensaje(
                "Ya tiraste el dado",
                `Salió ${numeroDado}. Elegí una ficha y movela con las flechas.`,
                "aviso"
            );
        }
        return;
    }

    numeroDado = Math.floor(Math.random() * 3) + 1;
    dadoTirado = true;

    const misFichas = fichas.filter(f => f.jugador === turnoActual && f.activa);
    fichasPendientesDeMover = misFichas.map(f => f.id);

    Sonido.dado();

    const dadoCentral = document.getElementById("dado-central");
    if (dadoCentral) {
        dadoCentral.classList.remove("animar-dado");
        void dadoCentral.offsetWidth;
        dadoCentral.classList.add("animar-dado");
    }
    animarNumeroDado(numeroDado);

    agregarHistorial(`${nombreJugador(turnoActual)} tiró el dado: salió ${numeroDado}.`);

    if (!hayMovimientosDisponibles()) {
        pasarTurnoPorBloqueo();
        return;
    }

    if (!esTurnoHumano()) {
        despues(1000, ejecutarMovimientoBot);
    }
}

function pasarTurnoPorBloqueo() {
    agregarHistorial(`${nombreJugador(turnoActual)} no tiene movimientos posibles y pierde el turno.`);

    if (esTurnoHumano()) {
        mostrarMensaje(
            "Sin movimientos posibles",
            "Todas las casillas a las que podrías llegar están ocupadas. Se pasa el turno.",
            "aviso"
        );
    }

    programarSiguienteTurno(1400);
}

function programarSiguienteTurno(demora) {
    turnoBloqueado = true;
    clearTimeout(timeoutSiguienteTurno);
    timeoutSiguienteTurno = despues(demora, siguienteTurno);
}

function calcularNuevaPosicion(filaActual, colActual, direccion, pasos) {
    let nuevaFila = filaActual;
    let nuevaCol = colActual;

    switch (direccion) {
        case "norte": nuevaFila = (filaActual - pasos + FILAS) % FILAS; break;
        case "sur":   nuevaFila = (filaActual + pasos) % FILAS; break;
        case "este":  nuevaCol = (colActual + pasos) % COLUMNAS; break;
        case "oeste": nuevaCol = (colActual - pasos + COLUMNAS) % COLUMNAS; break;
    }

    return { fila: nuevaFila, columna: nuevaCol };
}

function moverFicha(direccion) {
    if (!partidaActiva || turnoBloqueado) return;

    if (!dadoTirado || !numeroDado) {
        mostrarMensaje(
            "Primero tirá el dado",
            "Apretá el botón del dado para saber cuántas casillas podés avanzar.",
            "aviso"
        );
        return;
    }

    if (!fichaSeleccionada) {
        mostrarMensaje(
            "Elegí una ficha",
            "Hacé click en uno de tus caballeros y después usá las flechas para moverlo.",
            "aviso"
        );
        return;
    }

    if (!fichasPendientesDeMover.includes(fichaSeleccionada.id)) {
        mostrarMensaje(
            "Esa ficha ya se movió",
            "Cada ficha se mueve una sola vez por turno. Elegí otra que todavía no haya jugado.",
            "error"
        );
        return;
    }

    const ficha = fichaSeleccionada;
    const destino = calcularNuevaPosicion(ficha.fila, ficha.columna, direccion, numeroDado);

    const ocupante = fichaEn(destino.fila, destino.columna);
    if (ocupante) {
        const quien = ocupante.jugador === ficha.jugador
            ? "una de tus fichas"
            : `una ficha de ${nombreJugador(ocupante.jugador)}`;

        mostrarMensaje(
            "Casilla ocupada",
            `No podés moverte ${TEXTO_DIRECCION[direccion]}: en ${nombreCasilla(destino.fila, destino.columna)} ya hay ${quien}. Probá con otra dirección u otra ficha.`,
            "error"
        );
        sacudirTablero();
        return;
    }

    const antes = capturarPosicionFicha(ficha.id);

    ficha.fila = destino.fila;
    ficha.columna = destino.columna;
    totalMovimientos++;

    Sonido.mover();

    agregarHistorial(`${nombreJugador(turnoActual)} movió ficha a ${nombreCasilla(destino.fila, destino.columna)}`);

    fichasPendientesDeMover = fichasPendientesDeMover.filter(id => id !== ficha.id);
    fichaSeleccionada = null;
    animacionMovimiento = { id: ficha.id, antes };

    const resultado = comprobarConquistaCasa(destino.fila, destino.columna);

    crearTablero();

    if (resultado.gano) {
        finalizarPartida();
        return;
    }

    if (fichasPendientesDeMover.length === 0) {
        programarSiguienteTurno(resultado.conquisto ? 1100 : 550);
    } else if (!hayMovimientosDisponibles()) {
        pasarTurnoPorBloqueo();
    } else if (!esTurnoHumano()) {
        despues(1000, ejecutarMovimientoBot);
    }
}

function comprobarConquistaCasa(fila, columna) {
    const indiceCasa = casas.findIndex(c => c.fila === fila && c.columna === columna);

    if (indiceCasa === -1) return { conquisto: false, gano: false };

    casas.splice(indiceCasa, 1);
    conquistas[turnoActual]++;
    casillaConquistada = { fila, columna };

    const nombre = nombreJugador(turnoActual);
    const colorJugador = turnoActual === 1 ? configuracion.colorJ1 : configuracion.colorJ2;

    // La ficha nueva no aparece en el castillo: aparece en una casilla libre al lado
    const posClon = buscarCasillaLibreParaClon(fila, columna);
    let textoClon;

    if (posClon) {
        const nuevaFicha = {
            id: `f-${contadorFichas++}`,
            jugador: turnoActual,
            fila: posClon.fila,
            columna: posClon.columna,
            color: colorJugador,
            activa: true
        };
        fichas.push(nuevaFicha);
        fichaNuevaId = nuevaFicha.id;
        textoClon = `Apareció una ficha nueva en ${nombreCasilla(posClon.fila, posClon.columna)}.`;
    } else {
        textoClon = "No quedó lugar libre para una ficha nueva.";
    }

    document.getElementById(`casas-j${turnoActual}`).textContent = conquistas[turnoActual];
    agregarHistorial(`¡${nombre} conquistó la casa ${nombreCasilla(fila, columna)}! ${textoClon}`);

    mostrarMensaje(
        "¡Castillo conquistado!",
        `${nombre} tomó ${nombreCasilla(fila, columna)}. ${textoClon}`,
        "exito"
    );
    setTimeout(() => Sonido.conquista(), 300);

    return { conquisto: true, gano: conquistas[turnoActual] >= OBJETIVO_CASAS };
}

function comprobarTurnoBot() {
    if (!esTurnoHumano()) {
        despues(1000, tirarDado);
    }
}

function calcularDistanciaCilindrica(f1, c1, f2, c2) {
    const dFila = Math.abs(f1 - f2);
    const dCol = Math.abs(c1 - c2);

    const distFila = Math.min(dFila, FILAS - dFila);
    const distCol = Math.min(dCol, COLUMNAS - dCol);

    return distFila + distCol;
}

// Bot externo: POST {urlBot}/move -> { pieceId, direction } y GET {urlBot}/health
const DIRECCION_A_BOT = { norte: "north", sur: "south", este: "east", oeste: "west" };

const ALIAS_DIRECCION = {
    norte: ["north", "norte", "n", "up", "arriba"],
    sur:   ["south", "sur", "s", "down", "abajo"],
    este:  ["east", "este", "e", "right", "derecha"],
    oeste: ["west", "oeste", "o", "w", "left", "izquierda"]
};

function normalizarDireccion(valor) {
    const texto = String(valor ?? "").trim().toLowerCase();
    for (const [direccion, alias] of Object.entries(ALIAS_DIRECCION)) {
        if (alias.includes(texto)) return direccion;
    }
    return null;
}

// Acepta "localhost:3000", "http://localhost:3000/" o "http://localhost:3000/move"
function normalizarUrlBot(texto) {
    let url = String(texto || "").trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) {
        const esLocal = /^(localhost|127\.|192\.168\.|10\.|0\.0\.0\.0|\[::1\])/i.test(url);
        url = (esLocal ? "http://" : "https://") + url;
    }
    return url.replace(/\/(move|health)\/?$/i, "").replace(/\/+$/, "");
}

function urlBotValida(url) {
    try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function construirEstadoParaBot() {
    const movibles = fichas.filter(f => fichasPendientesDeMover.includes(f.id));

    const movimientosLegales = [];
    movibles.forEach(ficha => {
        obtenerMovimientosValidos(ficha, numeroDado).forEach(mov => {
            movimientosLegales.push({
                pieceId: ficha.id,
                direction: DIRECCION_A_BOT[mov.direccion],
                to: { row: mov.destino.fila, col: mov.destino.columna }
            });
        });
    });

    return {
        board: { rows: FILAS, cols: COLUMNAS, wrap: true },
        goal: OBJETIVO_CASAS,
        difficulty: configuracion.dificultad,
        round: rondaActual,
        currentPlayer: turnoActual,
        dice: numeroDado,
        scores: { 1: conquistas[1], 2: conquistas[2] },
        pieces: fichas.filter(f => f.activa).map(f => ({
            id: f.id,
            player: f.jugador,
            row: f.fila,
            col: f.columna,
            canMove: fichasPendientesDeMover.includes(f.id)
        })),
        houses: casas.map(c => ({ id: c.id, row: c.fila, col: c.columna })),
        legalMoves: movimientosLegales
    };
}

async function peticionBot(base, ruta, opciones = {}, espera = TIEMPO_ESPERA_BOT) {
    const controlador = new AbortController();
    const reloj = setTimeout(() => controlador.abort(), espera);

    try {
        return await fetch(base + ruta, { ...opciones, signal: controlador.signal });
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(`El bot tardó más de ${espera / 1000} segundos en responder.`);
        }
        throw new Error("No se pudo conectar con el bot. Revisá que esté corriendo, que la URL sea correcta y que tenga CORS habilitado.");
    } finally {
        clearTimeout(reloj);
    }
}

async function probarConexionBot(base) {
    const respuesta = await peticionBot(base, "/health", {}, TIEMPO_CONEXION_BOT);
    return { ok: respuesta.ok, estado: respuesta.status };
}

async function pedirMovimientoAlBot() {
    const respuesta = await peticionBot(urlBot, "/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(construirEstadoParaBot())
    });

    if (!respuesta.ok) {
        let detalle = "";
        try {
            const cuerpo = await respuesta.json();
            detalle = String(cuerpo.error || cuerpo.message || "");
        } catch { /* la respuesta no era JSON */ }
        throw new Error(`El bot respondió con error ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`);
    }

    let datos = null;
    try {
        datos = await respuesta.json();
    } catch { /* se informa abajo */ }

    if (!datos || typeof datos !== "object") {
        throw new Error("El bot no devolvió un JSON válido.");
    }
    if (datos.pieceId === undefined || datos.pieceId === null || datos.pieceId === "") {
        throw new Error("La respuesta del bot no trae el campo pieceId.");
    }

    const direccion = normalizarDireccion(datos.direction);
    if (!direccion) {
        throw new Error(`La dirección "${datos.direction}" no es válida. Tiene que ser north, south, east o west.`);
    }

    const ficha = fichas.find(f => f.activa && String(f.id) === String(datos.pieceId));
    if (!ficha) {
        throw new Error(`El bot eligió una ficha que no existe (pieceId ${datos.pieceId}).`);
    }
    if (ficha.jugador !== turnoActual) {
        throw new Error(`El bot eligió la ficha ${ficha.id}, que no es del jugador que tiene el turno.`);
    }
    if (!fichasPendientesDeMover.includes(ficha.id)) {
        throw new Error(`El bot eligió la ficha ${ficha.id}, que ya se movió en este turno.`);
    }

    const destino = calcularNuevaPosicion(ficha.fila, ficha.columna, direccion, numeroDado);
    if (fichaEn(destino.fila, destino.columna)) {
        throw new Error(`El bot quiso mover ${DIRECCION_A_BOT[direccion]} a ${nombreCasilla(destino.fila, destino.columna)}, que está ocupada.`);
    }

    return { ficha, direccion };
}

function mostrarIndicadorBot(visible) {
    let indicador = document.getElementById("indicador-bot");
    if (!indicador) {
        indicador = document.createElement("div");
        indicador.id = "indicador-bot";
        indicador.textContent = "🤖 El bot está pensando…";
        document.body.appendChild(indicador);
    }
    indicador.classList.toggle("visible", visible);
}

function cancelarSolicitudBot() {
    solicitudBot++;
    esperandoBot = false;
    mostrarIndicadorBot(false);
}

function falloDelBot(mensaje) {
    agregarHistorial(`${nombreJugador(turnoActual)} (bot) no pudo jugar y pierde el turno.`);
    mostrarMensaje("Problema con el bot", mensaje, "error");
    programarSiguienteTurno(1800);
}

async function ejecutarMovimientoBot() {
    if (!partidaActiva || turnoBloqueado || esperandoBot || fichasPendientesDeMover.length === 0) return;

    if (!hayMovimientosDisponibles()) {
        pasarTurnoPorBloqueo();
        return;
    }

    if (!urlBot) {
        falloDelBot("Todavía no configuraste la URL del bot. Tocá el botón 🤖 y pegala.");
        return;
    }

    const miSolicitud = ++solicitudBot;
    esperandoBot = true;
    mostrarIndicadorBot(true);

    let jugada;
    try {
        jugada = await pedirMovimientoAlBot();
    } catch (error) {
        if (miSolicitud !== solicitudBot) return;
        esperandoBot = false;
        mostrarIndicadorBot(false);
        falloDelBot(error.message);
        return;
    }

    if (miSolicitud !== solicitudBot) return;
    esperandoBot = false;
    mostrarIndicadorBot(false);

    fichaSeleccionada = jugada.ficha;
    moverFicha(jugada.direccion);
}

function actualizarEtiquetasBot() {
    const corta = urlBot ? urlBot.replace(/^https?:\/\//i, "") : "sin configurar";
    if (botonBotMenu) botonBotMenu.textContent = `🤖 Bot: ${corta}`;
    if (botonBotEncabezado) botonBotEncabezado.title = `Configurar el bot (${corta})`;
}

function crearModalBot() {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modal-bot";
    modal.style.display = "none";
    modal.innerHTML = `
        <div class="modal-contenido">
            <h2>🤖 Conectar el bot</h2>
            <p class="texto-ayuda">
                Pegá la dirección de tu bot, local (<code>http://localhost:3000</code>) o desplegado (<code>https://...</code>).
                El juego usa <code>GET /health</code> y <code>POST /move</code>.
            </p>
            <div class="opcion-menu">
                <label for="input-url-bot">URL del bot</label>
                <input id="input-url-bot" type="text" placeholder="http://localhost:3000 o https://mi-bot.onrender.com" autocomplete="off" spellcheck="false">
            </div>
            <p class="estado-bot" id="estado-bot"></p>
            <div class="botones-bot">
                <button type="button" class="boton-como-jugar" id="boton-probar-bot">Probar conexión</button>
                <button type="button" class="boton-principal" id="boton-guardar-bot">Guardar</button>
            </div>
            <button type="button" class="boton-como-jugar" id="boton-cerrar-bot">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector("#input-url-bot");
    const estado = modal.querySelector("#estado-bot");
    const botonProbar = modal.querySelector("#boton-probar-bot");
    const botonGuardar = modal.querySelector("#boton-guardar-bot");

    function mostrarEstado(texto, tipo = "") {
        estado.textContent = texto;
        estado.className = `estado-bot ${tipo}`.trim();
    }

    function leerUrl() {
        const url = normalizarUrlBot(input.value);
        if (url && !urlBotValida(url)) {
            mostrarEstado("Esa dirección no es válida. Probá con algo como http://localhost:3000 o https://mi-bot.com", "error");
            return null;
        }
        return url;
    }

    async function probar(url) {
        mostrarEstado("Probando conexión…", "cargando");
        botonProbar.disabled = true;
        botonGuardar.disabled = true;
        try {
            const resultado = await probarConexionBot(url);
            if (resultado.ok) {
                mostrarEstado("✅ Conectado: el bot respondió a GET /health.", "ok");
            } else {
                mostrarEstado(`⚠️ El bot responde, pero GET /health devolvió ${resultado.estado}.`, "aviso");
            }
            return true;
        } catch (error) {
            mostrarEstado(`❌ ${error.message}`, "error");
            return false;
        } finally {
            botonProbar.disabled = false;
            botonGuardar.disabled = false;
        }
    }

    function cerrar() {
        modal.style.display = "none";
    }

    botonProbar.addEventListener("click", () => {
        const url = leerUrl();
        if (url === null) return;
        if (!url) {
            mostrarEstado("Escribí primero la URL del bot.", "aviso");
            return;
        }
        probar(url);
    });

    botonGuardar.addEventListener("click", async () => {
        const url = leerUrl();
        if (url === null) return;

        urlBot = url;
        if (url) {
            localStorage.setItem("urlBot", url);
        } else {
            localStorage.removeItem("urlBot");
        }
        input.value = url;
        actualizarEtiquetasBot();

        if (!url) {
            mostrarEstado("Se quitó la URL del bot.", "aviso");
            return;
        }

        const respondio = await probar(url);
        if (respondio) setTimeout(cerrar, 900);
    });

    input.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") botonGuardar.click();
    });

    modal.querySelector("#boton-cerrar-bot").addEventListener("click", cerrar);

    return {
        abrir() {
            input.value = urlBot;
            mostrarEstado("");
            modal.style.display = "flex";
            input.focus();
        }
    };
}

function finalizarPartida() {
    partidaActiva = false;
    cancelarSolicitudBot();
    clearInterval(temporizador);
    clearTimeout(timeoutSiguienteTurno);

    const tiempoFin = new Date();
    const diferenciaMs = tiempoFin - tiempoInicioPartida;
    const minutos = Math.floor(diferenciaMs / 60000);
    const segundos = Math.floor((diferenciaMs % 60000) / 1000);

    const nombreGanador = nombreJugador(turnoActual);

    document.getElementById("victoria-subtitulo").textContent = `¡${nombreGanador} ha ganado la partida!`;
    document.getElementById("victoria-tiempo").textContent = `${minutos}m ${segundos}s`;
    document.getElementById("victoria-movimientos").textContent = totalMovimientos;
    document.getElementById("victoria-rondas").textContent = rondaActual;

    setTimeout(() => Sonido.victoria(), 900);

    setTimeout(() => {
        document.getElementById("modal-victoria").style.display = "flex";
    }, 1000);
}

function iniciarTemporizador() {
    clearInterval(temporizador);
    tiempoRestante = TIEMPO_TURNO;
    actualizarRelojUI();

    temporizador = setInterval(() => {
        if (!partidaActiva) return;

        tiempoRestante--;
        actualizarRelojUI();

        if (tiempoRestante <= 0) {
            clearInterval(temporizador);
            agregarHistorial(`${nombreJugador(turnoActual)} agotó su tiempo.`);

            if (esTurnoHumano()) {
                mostrarMensaje("Se acabó el tiempo", "Pasó el turno al otro jugador.", "aviso");
            }
            siguienteTurno();
        }
    }, 1000);
}

function actualizarRelojUI() {
    const elTiempo = document.getElementById("temporizador");
    if (elTiempo) elTiempo.textContent = `${tiempoRestante}s`;
}

function siguienteTurno() {
    clearTimeout(timeoutSiguienteTurno);
    timeoutSiguienteTurno = null;
    clearInterval(intervaloDado);
    cancelarSolicitudBot();

    if (!partidaActiva) return;

    turnoBloqueado = false;
    dadoTirado = false;
    numeroDado = null;
    fichaSeleccionada = null;
    fichasPendientesDeMover = [];

    const elDado = document.getElementById("dado");
    if (elDado) elDado.textContent = "-";

    const dadoCentral = document.getElementById("dado-central");
    if (dadoCentral) dadoCentral.textContent = "🎲";

    if (turnoActual === 1) {
        turnoActual = 2;
    } else {
        turnoActual = 1;
        rondaActual++;
    }

    actualizarInterfaz();
    iniciarTemporizador();
    comprobarTurnoBot();
}

function actualizarInterfaz() {
    const nombreJ1 = document.getElementById("nombre-j1").textContent;
    const nombreJ2 = document.getElementById("nombre-j2").textContent;

    document.getElementById("ronda").textContent = rondaActual;
    document.getElementById("turno").textContent = turnoActual === 1 ? nombreJ1 : nombreJ2;

    const p1 = document.getElementById("panel-jugador-1");
    const p2 = document.getElementById("panel-jugador-2");

    if (turnoActual === 1) {
        p1.classList.add("jugador-activo");
        p2.classList.remove("jugador-activo");
    } else {
        p2.classList.add("jugador-activo");
        p1.classList.remove("jugador-activo");
    }

    crearTablero();
}

function agregarHistorial(mensaje) {
    const contenedor = document.getElementById("historial-movimientos");
    if (!contenedor) return;

    const sinMov = contenedor.querySelector(".sin-movimientos");
    if (sinMov) sinMov.remove();

    const p = document.createElement("p");
    p.classList.add("movimiento");
    p.textContent = mensaje;

    contenedor.prepend(p);
}

const NOMBRE_JUEGO = "Guerra de Caballeros";
const IMAGEN_INICIO = "images/inicio.jpg";

// Cambia el nombre viejo por el nuevo en el título y en los textos de la página, sin tocar el HTML
function aplicarNombreJuego() {
    document.title = NOMBRE_JUEGO;

    const nombreViejo = /conquista\s+las\s+casas/gi;
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (recorrido.nextNode()) nodos.push(recorrido.currentNode);

    nodos.forEach(nodo => {
        const padre = nodo.parentElement;
        if (!padre || ["SCRIPT", "STYLE"].includes(padre.tagName)) return;
        const nuevoTexto = nodo.nodeValue.replace(nombreViejo, NOMBRE_JUEGO);
        if (nuevoTexto !== nodo.nodeValue) nodo.nodeValue = nuevoTexto;
    });
}

// El botón Start ya viene dibujado en images/inicio.jpg: encima va un botón invisible que recibe el click
function crearPantallaCarga(alIniciar) {
    const pantalla = document.createElement("div");
    pantalla.id = "pantalla-carga";
    pantalla.innerHTML = `
        <div class="carga-fondo"></div>
        <div class="carga-escena">
            <h1 class="carga-titulo-alt">${NOMBRE_JUEGO}</h1>
            <button type="button" class="carga-boton-start cargando" aria-label="Start" disabled>
                <span class="carga-texto-start">START</span>
            </button>
            <div class="carga-progreso-contenedor">
                <div class="carga-barra"><div class="carga-progreso"></div></div>
                <p class="carga-estado">Cargando…</p>
            </div>
        </div>
    `;
    document.body.appendChild(pantalla);

    const escena = pantalla.querySelector(".carga-escena");
    const boton = pantalla.querySelector(".carga-boton-start");
    const progreso = pantalla.querySelector(".carga-progreso");
    const estado = pantalla.querySelector(".carga-estado");
    const contenedorProgreso = pantalla.querySelector(".carga-progreso-contenedor");

    const rutas = [
        IMAGEN_INICIO,
        "images/castillo.png",
        "images/ficha.jpeg",
        "images/tablero-fondo.jpg (1) - copia_cleanup.jpeg"
    ];
    let cargadas = 0;

    rutas.forEach((ruta, indice) => {
        const img = new Image();
        img.onload = () => {
            cargadas++;
            if (indice === 0) escena.classList.add("visible");
        };
        img.onerror = () => {
            cargadas++;
            // Si falta la imagen de inicio se muestra una versión simple
            if (indice === 0) escena.classList.add("sin-imagen", "visible");
        };
        img.src = ruta;
    });

    const inicio = performance.now();
    const DURACION_MINIMA = 1500;

    const avanzar = setInterval(() => {
        const porTiempo = Math.min(1, (performance.now() - inicio) / DURACION_MINIMA);
        const porImagenes = cargadas / rutas.length;
        const valor = Math.min(porTiempo, 0.15 + porImagenes * 0.85);
        progreso.style.width = `${Math.round(valor * 100)}%`;

        if (porTiempo >= 1 && cargadas === rutas.length) {
            clearInterval(avanzar);
            progreso.style.width = "100%";
            estado.textContent = "¡Listo!";
            setTimeout(() => {
                contenedorProgreso.classList.add("oculto");
                boton.classList.remove("cargando");
                boton.disabled = false;
                boton.focus();
            }, 300);
        }
    }, 50);

    boton.addEventListener("click", () => {
        Sonido.preparar();
        Sonido.click();
        pantalla.classList.add("saliendo");
        setTimeout(() => pantalla.remove(), 800);
        alIniciar();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    aplicarNombreJuego();

    const modalMenu = document.getElementById("modal-menu");
    const modalVictoria = document.getElementById("modal-victoria");
    const modalManual = document.getElementById("modal-manual");
    const selectModo = document.getElementById("select-modo");
    const contenedorDificultad = document.getElementById("contenedor-dificultad");
    const modalBot = crearModalBot();
    const botonIniciar = document.getElementById("boton-iniciar");
    botonBotMenu = document.createElement("button");
    botonBotMenu.type = "button";
    botonBotMenu.id = "boton-bot-menu";
    botonBotMenu.className = "boton-como-jugar";
    botonIniciar.parentNode.insertBefore(botonBotMenu, botonIniciar);
    botonBotMenu.addEventListener("click", () => modalBot.abrir());
    actualizarEtiquetasBot();

    function actualizarVisibilidadDificultad() {
        if (selectModo.value === "pvp") {
            contenedorDificultad.style.display = "none";
            botonBotMenu.style.display = "none";
        } else {
            contenedorDificultad.style.display = "flex";
            botonBotMenu.style.display = "block";
        }
    }

    selectModo.addEventListener("change", actualizarVisibilidadDificultad);
    actualizarVisibilidadDificultad();

    crearPantallaCarga(() => {
        modalMenu.style.display = "flex";
    });

    botonIniciar.addEventListener("click", async () => {
        const c1 = document.getElementById("select-color-j1").value;
        const c2 = document.getElementById("select-color-j2").value;

        if (c1 === c2) {
            mostrarMensaje(
                "Colores repetidos",
                "Cada jugador tiene que elegir un color distinto para sus fichas.",
                "error"
            );
            return;
        }

        Sonido.preparar();

        if (selectModo.value !== "pvp") {
            if (!urlBot) {
                mostrarMensaje(
                    "Falta la URL del bot",
                    "Para jugar con un bot, primero conectalo: pegá su dirección en la ventana que se abrió.",
                    "aviso"
                );
                modalBot.abrir();
                return;
            }

            const textoOriginal = botonIniciar.textContent;
            botonIniciar.disabled = true;
            botonIniciar.textContent = "Conectando con el bot (puede tardar)…";

            try {
                await probarConexionBot(urlBot);
            } catch (error) {
                mostrarMensaje("No hay conexión con el bot", error.message, "error");
                modalBot.abrir();
                return;
            } finally {
                botonIniciar.disabled = false;
                botonIniciar.textContent = textoOriginal;
            }
        }

        configuracion.modo = selectModo.value;
        configuracion.dificultad = document.getElementById("select-dificultad").value;
        configuracion.colorJ1 = c1;
        configuracion.colorJ2 = c2;
        configuracion.nombreJ1 = document.getElementById("input-nombre-j1").value.trim() || "Jugador 1";
        configuracion.nombreJ2 = document.getElementById("input-nombre-j2").value.trim() || "Jugador 2";

        modalMenu.style.display = "none";
        reiniciarPartida();
    });

    document.getElementById("boton-reiniciar-victoria").addEventListener("click", () => {
        modalVictoria.style.display = "none";
        modalMenu.style.display = "flex";
    });

    document.getElementById("boton-menu").addEventListener("click", () => {
        modalMenu.style.display = "flex";
    });

    document.getElementById("boton-manual")?.addEventListener("click", () => {
        modalManual.style.display = "flex";
    });

    document.getElementById("boton-cerrar-manual")?.addEventListener("click", () => {
        modalManual.style.display = "none";
    });

    document.getElementById("boton-dado")?.addEventListener("click", () => {
        if (verificarTurnoHumano()) tirarDado();
    });

    document.querySelectorAll("[data-direccion]").forEach(btn => {
        btn.addEventListener("click", () => {
            if (verificarTurnoHumano()) moverFicha(btn.dataset.direccion);
        });
    });

    const botonTema = document.getElementById("boton-tema");
    if (botonTema) {
        botonTema.addEventListener("click", () => {
            document.body.classList.toggle("modo-claro");
            const esClaro = document.body.classList.contains("modo-claro");
            botonTema.textContent = esClaro ? "☀️" : "🌙";
            localStorage.setItem("tema", esClaro ? "claro" : "oscuro");
        });

        if (localStorage.getItem("tema") === "claro") {
            document.body.classList.add("modo-claro");
            botonTema.textContent = "☀️";
        }

        const botonSonido = document.createElement("button");
        botonSonido.type = "button";
        botonSonido.id = "boton-sonido";
        botonSonido.className = botonTema.className;
        botonSonido.title = "Activar / silenciar sonidos";
        botonSonido.textContent = Sonido.estaActivo() ? "🔊" : "🔇";
        botonSonido.addEventListener("click", () => {
            botonSonido.textContent = Sonido.alternar() ? "🔊" : "🔇";
        });

        const acciones = document.createElement("div");
        acciones.className = "acciones-encabezado";
        botonTema.parentNode.insertBefore(acciones, botonTema);

        botonBotEncabezado = document.createElement("button");
        botonBotEncabezado.type = "button";
        botonBotEncabezado.id = "boton-bot";
        botonBotEncabezado.className = botonTema.className;
        botonBotEncabezado.textContent = "🤖";
        botonBotEncabezado.addEventListener("click", () => modalBot.abrir());
        actualizarEtiquetasBot();

        acciones.append(botonBotEncabezado, botonSonido, botonTema);
    }
});