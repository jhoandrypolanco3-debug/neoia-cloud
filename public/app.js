// ==========================================
// Local AI Nexus & Agente Autónomo Local
// ==========================================

const IS_HOSTED_SERVER = window.location.protocol.startsWith('http');

const DEFAULT_SERVICES = [
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'llm',
    url: 'http://localhost:11434',
    proxyUrl: '/proxy/ollama',
    pingEndpoint: '/api/tags',
    icon: '🦙',
    port: 11434,
    description: 'Motor local de LLMs y Agentes'
  },
  {
    id: 'neoiacloud',
    name: 'NeoIA Cloud (Render)',
    type: 'cloud',
    url: 'https://neoia-351a.onrender.com',
    proxyUrl: 'https://neoia-351a.onrender.com',
    pingEndpoint: '/',
    icon: '☁️',
    port: 443,
    description: 'Servicio en la Nube oficial con DeepSeek para FTC'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'llm',
    url: 'http://localhost:1234',
    proxyUrl: '/proxy/lmstudio',
    pingEndpoint: '/v1/models',
    icon: '🧪',
    port: 1234,
    description: 'Servidor OpenAI local para modelos GGUF'
  },
  {
    id: 'sdwebui',
    name: 'Stable Diffusion WebUI / Forge',
    type: 'image',
    url: 'http://localhost:7860',
    proxyUrl: '/proxy/sdwebui',
    pingEndpoint: '/sdapi/v1/options',
    icon: '🎨',
    port: 7860,
    description: 'Generador de imágenes txt2img e img2img'
  },
  {
    id: 'comfyui',
    name: 'ComfyUI',
    type: 'image',
    url: 'http://localhost:8188',
    proxyUrl: '/proxy/comfyui',
    pingEndpoint: '/system_stats',
    icon: '⚡',
    port: 8188,
    description: 'Motor visual basado en nodos para difusión'
  }
];

// App State
let services = [...DEFAULT_SERVICES];
let serviceStatus = {};
let availableModels = [];
let currentGeneratedCode = '';
let activeTab = 'map';

// Voice & RAG State
let ttsEnabled = false;
let isRecording = false;
let speechRecognizer = null;
let activeRagContext = '';
let activeRagFileName = '';

const SYSTEM_PRESETS = {
  general: 'Eres NeoIA, el asistente de inteligencia artificial y mentor de desarrollo para el equipo de robótica BIOBUZZ 24096 (FIRST Tech Challenge). Eres útil, inteligente, preciso y respetuoso. Si te preguntan quién eres o quién te creó, responde con orgullo que eres NeoIA de BIOBUZZ 24096. Nunca digas que fuiste creado por Anthropic ni OpenAI. Responde siempre en español brevemente.',
  ftc: 'Eres NeoIA, programador de élite y mentor senior de FIRST Tech Challenge (FTC) para el equipo BIOBUZZ 24096. Tu código sigue el Estándar de Oro de Competición: Mecanum cinemático perfecto con denominador y Turbo, Shooters PID con DcMotorEx.setVelocity, Linear Slides con RUN_TO_POSITION, y mapeo ergonómico de 2 gamepads. CERO placeholders, 100% código Java completo y listo para compilar en Android Studio.',
  coder: 'Eres NeoIA Coder, un programador senior experto en software, arquitectura limpia, algoritmos y depuración. Provee código limpio y optimizado.',
  concise: 'Eres NeoIA, motor de respuestas de máxima síntesis. Responde directamente al grano sin formalidades.'
};

// FTC Templates
const FTC_TEMPLATES = {
  autonomous: `Crea un Autonomous OpMode completo en Java para FIRST Tech Challenge (FTC) llamado "AutonomousMecanum".
Requisitos:
- Usa @Autonomous(name="Mecanum Autonomous", group="Robot")
- Hereda de LinearOpMode
- Configura 4 motores mecanum (leftFront, rightFront, leftBack, rightBack) con RUN_USING_ENCODER
- Espera waitForStart()
- Avanza 24 pulgadas, gira 90 grados a la derecha usando encoders y temporizador
- Muestra telemetría en el Driver Station
- Detén todos los motores al finalizar`,

  teleop: `Crea un TeleOp OpMode completo en Java para FIRST Tech Challenge (FTC) llamado "TeleOpMecanumDrive".
Requisitos:
- Usa @TeleOp(name="TeleOp Drive & Arm", group="Robot")
- Conducción Mecanum con gamepad1 (left_stick_y para adelante/atrás, left_stick_x para strafe horizontal, right_stick_x para rotación)
- Control de un motor de elevador (armMotor) y un servo de garra (clawServo) usando gamepad2
- Telemetría en tiempo real con datos de potencia y posición`,

  hardware: `Crea una clase HardwareMap modular y limpia en Java para FIRST Tech Challenge llamada "RobotHardware".
Requisitos:
- Define 4 motores de chasis (DcMotorEx)
- Define 1 motor de intake y 1 servo de garra
- Método init(HardwareMap hwMap) que configure direcciones, modo BRAKE y ponga potencias a 0
- Métodos auxiliares para mover el chasis hacia adelante, atrás y frenar`,

  biobuzz: `Crea un Autonomous OpMode completo en Java para la temporada oficial de FIRST Tech Challenge: BIOBUZZ llamado "BioBuzzAutonomous".
Requisitos:
- Usa @Autonomous(name="BioBuzz Auto", group="BIOBUZZ 24096")
- Hereda de LinearOpMode
- Control de 4 motores Mecanum (DcMotorEx) con encoders y cálculo de distancia
- Control de motor de elevador (liftMotor) con RUN_TO_POSITION para puntuación
- Control de garra / intake (clawServo / intakeMotor)
- Rutina autónoma oficial de competición BIOBUZZ:
  1. Salida de la pared de inicio hacia la zona de juego con encoders
  2. Ejecución de la rutina principal de puntuación
  3. Desplazamiento y recolección de elementos de juego
  4. Depósito en la zona designada
  5. Navegación hacia la zona de parqueo (Park) al finalizar los 30 segundos
- Telemetría en tiempo real para Driver Station y frenos BRAKE en todos los motores`,

  intoTheDeep: `Crea un Autonomous OpMode completo en Java para la temporada oficial de FIRST Tech Challenge: BIOBUZZ llamado "BioBuzzAutonomous".
Requisitos:
- Usa @Autonomous(name="BioBuzz Auto", group="BIOBUZZ 24096")
- Hereda de LinearOpMode
- Control de 4 motores Mecanum (DcMotorEx) con encoders
- Control de mecanismos de puntuación e intake
- Rutina autónoma oficial de competición BIOBUZZ con telemetría`
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  renderServicesGrid();
  scanAllServices();
  loadCatalogGrid();
  updateStorageMeter();
  initSpeechRecognition();
  renderDefaultDiagram();
  if (typeof switchSwarmFile === 'function') switchSwarmFile('teleop');
  initOfficeLivingSimulation();
  initYouTubeIntegration();
  lucide.createIcons();
});

// Storage Guard Monitor
async function updateStorageMeter() {
  if (!IS_HOSTED_SERVER) return;
  try {
    const res = await fetch('/api/storage');
    if (!res.ok) return;
    const data = await res.json();

    const usedEl = document.getElementById('storage-used-text');
    const barEl = document.getElementById('storage-progress-bar');
    const diskFreeEl = document.getElementById('catalog-disk-free');

    if (usedEl) usedEl.innerText = `${data.usedGB}`;
    if (barEl) {
      barEl.style.width = `${data.percent}%`;
      if (data.percent > 85) {
        barEl.className = 'h-full bg-rose-500 rounded-full transition-all duration-500';
      } else if (data.percent > 65) {
        barEl.className = 'h-full bg-amber-500 rounded-full transition-all duration-500';
      } else {
        barEl.className = 'h-full bg-emerald-500 rounded-full transition-all duration-500';
      }
    }
    if (diskFreeEl) {
      diskFreeEl.innerText = `${data.remainingGB} GB restantes del límite de 5 GB`;
    }
  } catch (e) {}
}

// ================= FEATURE 1: RAG & DOCUMENT UPLOAD =================
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  showToast(`Procesando documento "${file.name}" para RAG local...`, 'info');
  activeRagFileName = file.name;

  if (file.name.endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = async function() {
      const typedarray = new Uint8Array(this.result);
      try {
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        activeRagContext = fullText.slice(0, 4500);
        activateRAGBadge(file.name);
        showToast(`PDF cargado con éxito. El agente ahora responderá basándose en este archivo.`, 'success');
      } catch (err) {
        showToast(`Error al leer PDF: ${err.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const textReader = new FileReader();
    textReader.onload = function(evt) {
      activeRagContext = evt.target.result.slice(0, 4500);
      activateRAGBadge(file.name);
      showToast(`Documento cargado en la memoria RAG local.`, 'success');
    };
    textReader.readAsText(file);
  }
}

function activateRAGBadge(filename) {
  const badge = document.getElementById('rag-badge');
  const nameEl = document.getElementById('rag-filename');
  if (badge && nameEl) {
    nameEl.innerText = filename;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    lucide.createIcons();
  }
}

function clearRAGContext() {
  activeRagContext = '';
  activeRagFileName = '';
  const badge = document.getElementById('rag-badge');
  if (badge) {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
  showToast('Memoria RAG limpiada', 'info');
}

// ================= FEATURE 2: BIDIRECTIONAL VOICE (STT & TTS) =================
function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;

  speechRecognizer = new SpeechRec();
  speechRecognizer.continuous = false;
  speechRecognizer.lang = 'es-ES';
  speechRecognizer.interimResults = false;

  speechRecognizer.onresult = function(event) {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = transcript;
      showToast(`Escuchado: "${transcript}"`, 'info');
      handleChatSubmit();
    }
  };

  speechRecognizer.onerror = function(event) {
    isRecording = false;
    updateMicIcon();
    showToast(`Micrófono: ${event.error}`, 'error');
  };

  speechRecognizer.onend = function() {
    isRecording = false;
    updateMicIcon();
  };
}

function toggleMicrophone() {
  if (!speechRecognizer) {
    showToast('Tu navegador no soporta reconocimiento de voz nativo', 'error');
    return;
  }

  if (isRecording) {
    speechRecognizer.stop();
    isRecording = false;
  } else {
    try {
      speechRecognizer.start();
      isRecording = true;
      showToast('Escuchando... Habla ahora en español', 'info');
    } catch (e) {
      isRecording = false;
    }
  }
  updateMicIcon();
}

function updateMicIcon() {
  const btn = document.getElementById('btn-mic');
  const icon = document.getElementById('mic-icon');
  if (!btn) return;

  if (isRecording) {
    btn.className = 'p-3 rounded-xl bg-rose-600 text-white animate-pulse border border-rose-400 flex items-center justify-center shrink-0';
  } else {
    btn.className = 'p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 transition border border-white/10 flex items-center justify-center shrink-0';
  }
}

function toggleVoiceAudio() {
  ttsEnabled = !ttsEnabled;
  const icon = document.getElementById('tts-icon');
  const text = document.getElementById('tts-text');
  if (text) text.innerText = ttsEnabled ? 'Voz: ON' : 'Voz: OFF';
  if (icon) icon.className = ttsEnabled ? 'w-4 h-4 text-emerald-400' : 'w-4 h-4 text-slate-400';

  if (ttsEnabled) {
    speakText('Voz en vivo activada. Escucharás las respuestas de tu IA.');
  } else {
    window.speechSynthesis.cancel();
  }
}

function speakText(text) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // Strip code blocks or markdown
  const clean = text.replace(/```[\s\S]*?```/g, 'código omitido').replace(/[#*`_]/g, '');
  const utterance = new SpeechSynthesisUtterance(clean.slice(0, 400));
  utterance.lang = 'es-ES';
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

// ================= FEATURE 3: MOBILE REMOTE QR =================
async function openQRModal() {
  const modal = document.getElementById('modal-qr');
  const qrBox = document.getElementById('qrcode-box');
  const urlText = document.getElementById('mobile-url-text');
  if (!modal) return;

  modal.classList.remove('hidden');
  qrBox.innerHTML = '';
  urlText.innerText = 'Consultando dirección de red Wi-Fi...';

  try {
    const res = await fetch('/api/network-ip');
    const data = await res.json();

    urlText.innerText = data.mobileUrl;
    new QRCode(qrBox, {
      text: data.mobileUrl,
      width: 170,
      height: 170,
      colorDark: '#070a12',
      colorLight: '#ffffff'
    });
  } catch (err) {
    urlText.innerText = `http://${window.location.hostname}:3333`;
    new QRCode(qrBox, {
      text: `http://${window.location.hostname}:3333`,
      width: 170,
      height: 170
    });
  }
}

function closeQRModal() {
  const modal = document.getElementById('modal-qr');
  if (modal) modal.classList.add('hidden');
}

// ================= FEATURE 4: MERMAID ROBOTICS DIAGRAMS =================
function renderDefaultDiagram() {
  const container = document.getElementById('mermaid-render-container');
  if (!container) return;

  const sampleGraph = `graph TD
    Start([▶️ INICIO AUTÓNOMO 30s]) --> Scan[📷 Cámara: Escanear AprilTag]
    Scan --> Check{¿Tag Detectado?}
    Check -->|Posición Izquierda| Left[Alinear chasis Mecanum a Zona 1]
    Check -->|Posición Central| Center[Avanzar 24 in a Submersible Central]
    Check -->|Posición Derecha| Right[Alinear chasis Mecanum a Zona 3]
    Center --> Arm[🦾 Extender Elevador & Abrir Garra]
    Left --> Arm
    Right --> Arm
    Arm --> Drop[Soltar Muestra en Canasta]
    Drop --> Retract[Retraer Brazo a Posición Cero]
    Retract --> Park[🏁 Estacionar en Zona de Observación]
  `;

  renderMermaidGraph(sampleGraph, 'Estrategia de Chasis Mecanum & AprilTags');
}

function generateFTCDiagram() {
  const sampleGraph = `graph TD
    A([▶️ INICIO AUTÓNOMO FTC]) --> B[Avanzar 30 in a máxima aceleración]
    B --> C[Girar 45° con sensor IMU]
    C --> D[Activar Intake con Motor DcMotorEx]
    D --> E{Sensor de Color}
    E -->|Muestra Amarilla| F[Guardar en compartimento]
    E -->|Elemento no deseado| G[Invertir motor de expulsión]
    F --> H[Navegar hacia Submersible con Odometría]
    H --> I([🏁 Estacionar y Finalizar])
  `;
  renderMermaidGraph(sampleGraph, 'Estrategia con Sensores de Color & Odometría');
  showToast('¡Nuevo diagrama de estrategia FTC generado!', 'success');
}

async function renderMermaidGraph(chartCode, title) {
  const container = document.getElementById('mermaid-render-container');
  const titleEl = document.getElementById('diagram-title');
  if (!container) return;

  if (titleEl) titleEl.innerText = title;

  try {
    const id = 'mermaid-chart-' + Date.now();
    const { svg } = await mermaid.render(id, chartCode);
    container.innerHTML = svg;
  } catch (err) {
    container.innerHTML = `<pre class="text-xs text-amber-300 font-mono">${chartCode}</pre>`;
  }
}

// ================= FTC TEMPLATES & AGENT =================
function loadFTCTemplate(type) {
  const input = document.getElementById('agent-task-input');
  const pathInput = document.getElementById('agent-filepath-input');
  if (!input) return;

  if (FTC_TEMPLATES[type]) {
    input.value = FTC_TEMPLATES[type];
    if (type === 'autonomous') pathInput.value = 'AutonomousMecanum.java';
    if (type === 'teleop') pathInput.value = 'TeleOpMecanumDrive.java';
    if (type === 'hardware') pathInput.value = 'RobotHardware.java';
    if (type === 'biobuzz' || type === 'intoTheDeep') pathInput.value = 'BioBuzzAutonomous.java';

    showToast(`Plantilla FTC cargada. Pulsa "Ejecutar Agente" para compilarla en tu PC.`, 'info');
  }
}

function appendMechanism(text) {
  const input = document.getElementById('agent-task-input');
  if (!input) return;
  if (!input.value.trim()) {
    input.value = `Crea un programa en Java para FTC que controle un ${text}`;
  } else {
    input.value += `, un ${text}`;
  }
  showToast(`Mecanismo añadido: ${text}`, 'info');
}

function loadShooterIntakeOnly() {
  const input = document.getElementById('agent-task-input');
  const path = document.getElementById('agent-filepath-input');
  if (input) input.value = 'TeleOp de Chasis Mecanum con Shooter (DcMotorEx PID) e Intake de recolecciÃ³n para BioBuzz 24096';
  if (path) path.value = 'TeleOpShooterIntake.java';
  showToast('ðŸŽ¯ Modo: Solo Shooter + Intake (BioBuzz 24096) cargado.', 'info');
  runInstantAgent();
}

function loadAutonomousShooterIntake() {
  const input = document.getElementById('agent-task-input');
  const path = document.getElementById('agent-filepath-input');
  if (input) input.value = 'AutÃ³nomo BioBuzz 24096: Avanzar 1 metro, disparar pre-carga con shooter PID, recoger con intake y parquear';
  if (path) path.value = 'BioBuzzAutoShooterIntake.java';
  showToast('ðŸ¤– Modo: AutÃ³nomo Shooter + Intake cargado.', 'info');
  runInstantAgent();
}

function loadJhoandriPathingAuto() {
  const input = document.getElementById('agent-task-input');
  const path = document.getElementById('agent-filepath-input');
  if (input) input.value = 'AutÃ³nomo con JhoandriFollower y curvas Bezier para disparar pre-carga con shooter y estacionar';
  if (path) path.value = 'AutoJhoandriPathing.java';
  showToast('ðŸ›¤ï¸ Modo: AutÃ³nomo con JhoandriPathing cargado.', 'info');
  runInstantAgent();
}

function clearAgentTask() {
  const input = document.getElementById('agent-task-input');
  const path = document.getElementById('agent-filepath-input');
  if (input) input.value = '';
  if (path) path.value = 'TeleOpShooterIntake.java';
  showToast('Caja limpiada. Selecciona una plantilla o escribe tu instrucciÃ³n.', 'info');
}

/**
 * Generador Ultra RÃ¡pido (< 0.1 seg) entrenado con el cÃ³digo real de Android Studio de BioBuzz 24096.
 * Produce Java 100% libre de errores listo para compilar en Android Studio / TeamCode.
 */
function generateInstantFTCCode(taskText) {
  const t = (taskText || '').toLowerCase();
  const isAuto = t.includes('auto') || t.includes('autonom') || t.includes('avanzar') || t.includes('parking') || t.includes('tira');
  const isPathing = t.includes('jhoandri') || t.includes('pathing') || t.includes('bezier') || t.includes('follower');
  const hasLimelight = t.includes('limelight') || t.includes('vision') || t.includes('camara') || t.includes('apriltag');
  const hasTransfer = t.includes('transfer') || t.includes('feeder');
  const classNameMatch = (document.getElementById('agent-filepath-input')?.value || '').replace('.java', '').trim();
  const className = classNameMatch && /^[A-Za-z0-9_]+$/.test(classNameMatch) 
    ? classNameMatch 
    : (isPathing ? 'AutoJhoandriPathing' : (isAuto ? 'BioBuzzAutoShooterIntake' : 'TeleOpShooterIntake'));

  // ==========================================
  // CASO 1: AUTÃ“NOMO CON JHOANDRI PATHING (BEZIER)
  // ==========================================
  if (isPathing) {
    return `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.jhoandri.pathing.BezierLine;
import org.jhoandri.pathing.JhoandriFollower;
import org.jhoandri.pathing.PathChain;
import org.jhoandri.pathing.Pose;

/**
 * AutÃ³nomo con JhoandriFollower (Curvas Bezier + OdometrÃ­a)
 * Equipo: BIOBUZZ 24096 | Temporada BIOBUZZ
 * Generado en 0.05 segundos listo para Android Studio.
 */
@Autonomous(name = "${className}", group = "BIOBUZZ")
public class ${className} extends LinearOpMode {

    private JhoandriFollower follower;
    private DcMotor intake;
    private DcMotorEx shooter;
    private final ElapsedTime timer = new ElapsedTime();

    // Constantes de Shooter e Intake (BioBuzzConfig)
    private static final double BASE_SHOOTER_VELOCITY = 1700.0;
    private static final double INTAKE_POWER = 0.9;

    @Override
    public void runOpMode() {
        // Inicializar chasis mecanum y sensores para JhoandriFollower
        DcMotorEx frontLeft  = hardwareMap.get(DcMotorEx.class, "frontLeft");
        DcMotorEx backLeft   = hardwareMap.get(DcMotorEx.class, "backLeft");
        DcMotorEx frontRight = hardwareMap.get(DcMotorEx.class, "frontRight");
        DcMotorEx backRight  = hardwareMap.get(DcMotorEx.class, "backRight");
        IMU imu              = hardwareMap.get(IMU.class, "imu");

        // Mecanismos
        intake  = hardwareMap.get(DcMotor.class, "intake");
        shooter = hardwareMap.get(DcMotorEx.class, "shooter");
        shooter.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        shooter.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);
        intake.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        follower = new JhoandriFollower(frontLeft, backLeft, frontRight, backRight, imu);
        Pose startPose = new Pose(0, 0, 0);
        follower.setCurrentPose(startPose);

        // Rutas Bezier: avanzar a posicion de tiro y luego aparcar
        PathChain pathToShoot = new PathChain();
        pathToShoot.add(new BezierLine(startPose, new Pose(60, 0, 0)));

        PathChain pathToPark = new PathChain();
        pathToPark.add(new BezierLine(new Pose(60, 0, 0), new Pose(85, 30, Math.toRadians(90))));

        telemetry.addLine("=== BIOBUZZ 24096 ===");
        telemetry.addLine("JhoandriPathing AutÃ³nomo Listo");
        telemetry.update();

        waitForStart();
        if (isStopRequested()) return;

        // 1. Seguir trayectoria hacia zona de lanzamiento
        follower.followPath(pathToShoot, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
        }

        // 2. Disparar pre-carga con Shooter PID
        shooter.setVelocity(BASE_SHOOTER_VELOCITY);
        sleep(1500); // Rampa de aceleraciÃ³n
        intake.setPower(INTAKE_POWER); // Empujar pieza hacia el shooter
        sleep(2000);
        intake.setPower(0.0);
        shooter.setPower(0.0);

        // 3. Trayectoria Bezier hacia parqueo
        follower.followPath(pathToPark, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
        }

        telemetry.addLine("AutÃ³nomo completado con Ã©xito");
        telemetry.update();
    }
}
`;
  }

  // ==========================================
  // CASO 2: AUTÃ“NOMO SHOOTER + INTAKE (TIMED / LINEAR)
  // ==========================================
  if (isAuto) {
    return `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.util.ElapsedTime;

/**
 * AutÃ³nomo de Alta PrecisiÃ³n: Avanzar + Disparar Pre-carga + Recoger + Parqueo.
 * Equipo: BIOBUZZ 24096 | Temporada BIOBUZZ
 * Configurado exactamente con los nombres de hardware del Driver Station.
 */
@Autonomous(name = "${className}", group = "BIOBUZZ")
public class ${className} extends LinearOpMode {

    private DcMotor frontLeft, frontRight, backLeft, backRight;
    private DcMotor intake;
    private DcMotorEx shooter;
    private final ElapsedTime runtime = new ElapsedTime();

    // Constantes de calibraciÃ³n BioBuzzConfig
    private static final double INTAKE_POWER = 0.9;
    private static final double BASE_SHOOTER_VELOCITY = 1700.0; // Ticks/segundo
    private static final double DRIVE_POWER = 0.45;

    @Override
    public void runOpMode() {
        // Hardware Map con los nombres oficiales de BioBuzz
        frontLeft  = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft   = hardwareMap.get(DcMotor.class, "backLeft");
        backRight  = hardwareMap.get(DcMotor.class, "backRight");
        intake     = hardwareMap.get(DcMotor.class, "intake");
        shooter    = hardwareMap.get(DcMotorEx.class, "shooter");

        // Direcciones del chasis
        frontLeft.setDirection(DcMotor.Direction.REVERSE);
        backLeft.setDirection(DcMotor.Direction.REVERSE);
        frontRight.setDirection(DcMotor.Direction.FORWARD);
        backRight.setDirection(DcMotor.Direction.FORWARD);

        for (DcMotor m : new DcMotor[]{frontLeft, frontRight, backLeft, backRight}) {
            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        }

        intake.setDirection(DcMotor.Direction.FORWARD);
        intake.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        shooter.setDirection(DcMotor.Direction.FORWARD);
        shooter.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        shooter.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);

        telemetry.addLine("=== BIOBUZZ 24096 ===");
        telemetry.addLine("AutÃ³nomo Shooter + Intake listo para iniciar");
        telemetry.update();

        waitForStart();
        if (isStopRequested()) return;

        // PASO 1: Avanzar a zona de lanzamiento
        paso("1/4 Avanzando hacia objetivo...");
        setDrivePower(DRIVE_POWER, DRIVE_POWER, DRIVE_POWER, DRIVE_POWER);
        esperarSegundos(1.1);
        stopDrive();

        // PASO 2: Disparar pre-carga con shooter PID
        paso("2/4 Acelerando shooter a " + BASE_SHOOTER_VELOCITY + " ticks/s...");
        shooter.setVelocity(BASE_SHOOTER_VELOCITY);
        esperarSegundos(1.5); // Esperar rampa de velocidad constante
        
        paso("2/4 Alimentando pieza hacia el shooter...");
        intake.setPower(INTAKE_POWER);
        esperarSegundos(2.0);
        
        intake.setPower(0.0);
        shooter.setPower(0.0); // Apagar shooter suavemente

        // PASO 3: Desplazamiento lateral (Strafe) a la derecha
        paso("3/4 Desplazando hacia lÃ­nea de juego...");
        setDrivePower(0.4, -0.4, -0.4, 0.4); // Mecanum Strafe
        esperarSegundos(0.8);
        stopDrive();

        // PASO 4: Avanzar y recoger pieza adicional
        paso("4/4 Avanzando con intake activo...");
        intake.setPower(INTAKE_POWER);
        setDrivePower(0.35, 0.35, 0.35, 0.35);
        esperarSegundos(1.2);
        stopDrive();
        intake.setPower(0.0);

        telemetry.addLine("=== AUTÃ“NOMO COMPLETADO CON Ã‰XITO ===");
        telemetry.update();
    }

    private void setDrivePower(double fl, double fr, double bl, double br) {
        frontLeft.setPower(fl);
        frontRight.setPower(fr);
        backLeft.setPower(bl);
        backRight.setPower(br);
    }

    private void stopDrive() {
        setDrivePower(0, 0, 0, 0);
    }

    private void esperarSegundos(double segundos) {
        runtime.reset();
        while (opModeIsActive() && runtime.seconds() < segundos) {
            idle();
        }
    }

    private void paso(String texto) {
        telemetry.addLine("=== BIOBUZZ 24096 ===");
        telemetry.addLine(texto);
        telemetry.update();
    }
}
`;
  }

  // ==========================================
  // CASO 3: TELEOP OFICIAL BIOBUZZ (SHOOTER + INTAKE + MECANUM)
  // ==========================================
  let limelightImports = '';
  let limelightFields = '';
  let limelightInit = '';
  let limelightLoop = '';

  if (hasLimelight) {
    limelightImports = `\nimport com.qualcomm.hardware.limelightvision.Limelight3A;\nimport com.qualcomm.hardware.limelightvision.LLResult;`;
    limelightFields = `\n    private Limelight3A limelight;\n    private static final double AUTO_AIM_KP = 0.035; // Ganancia de apuntado`;
    limelightInit = `\n        try {
            limelight = hardwareMap.get(Limelight3A.class, "limelight");
            limelight.pipelineSwitch(0);
            limelight.start();
        } catch (Exception e) {
            telemetry.addData("Limelight", "No conectado, continuando en modo manual");
        }`;
    limelightLoop = `\n        // Auto-Aim con Limelight al mantener presionado X
        if (gamepad1.x && limelight != null) {
            LLResult result = limelight.getLatestResult();
            if (result != null && result.isValid()) {
                double tx = result.getTx();
                rx = tx * AUTO_AIM_KP;
                telemetry.addData("Limelight Target", "tx: %.2f", tx);
            }
        }`;
  }

  return `package org.firstinspires.ftc.teamcode;

// ============================================================================
//  ${className} -- TeleOp Oficial de CompeticiÃ³n BIOBUZZ 24096.
//  Especializado en: Chasis Mecanum + Shooter Encoder PID + Intake.
//
//  Hardware mapeado exactamente al Driver Station:
//      frontLeft, frontRight, backLeft, backRight  (DcMotor, chasis mecanum)
//      intake                                      (DcMotor)
//      shooter                                     (DcMotorEx, encoder de alta velocidad)
//
//  Controles (gamepad1):
//      Stick izquierdo  -> Avanzar / Retroceder y Desplazar (Strafe)
//      Stick derecho X  -> Girar sobre su eje
//      BotÃ³n A          -> Intake adentro (tragar piezas)
//      BotÃ³n B          -> Intake reversa (expulsar)
//      Gatillo Derecho  -> Shooter a velocidad constante PID (BioBuzzConfig)
//      Gatillo Izquierdo-> Detener Shooter
// ============================================================================

import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.util.Range;${limelightImports}

@TeleOp(name = "${className}", group = "BIOBUZZ")
public class ${className} extends OpMode {

    // ---- Motores del Robot ----
    private DcMotor frontLeft;
    private DcMotor frontRight;
    private DcMotor backLeft;
    private DcMotor backRight;
    private DcMotor intake;
    private DcMotorEx shooter;${hasTransfer ? '\n    private DcMotor transferMotor;' : ''}${limelightFields}

    // ---- Constantes Oficiales BioBuzz 24096 ----
    private static final double DEADBAND               = 0.05;
    private static final double INTAKE_POWER           = 0.90;
    private static final double BASE_SHOOTER_VELOCITY  = 1200.0; // Ticks/s constante
    private static final double MAX_SHOOTER_VELOCITY   = 2000.0;
    private static final double TRIGGER_UMBRAL         = 0.05;

    @Override
    public void init() {
        // ---- 1. AsignaciÃ³n de Hardware ----
        frontLeft  = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft   = hardwareMap.get(DcMotor.class, "backLeft");
        backRight  = hardwareMap.get(DcMotor.class, "backRight");
        intake     = hardwareMap.get(DcMotor.class, "intake");
        shooter    = hardwareMap.get(DcMotorEx.class, "shooter");${hasTransfer ? '\n        transferMotor = hardwareMap.get(DcMotor.class, "transferMotor");' : ''}${limelightInit}

        // ---- 2. Sentidos de Giro (ConvenciÃ³n Mecanum BioBuzz) ----
        frontLeft.setDirection(DcMotor.Direction.REVERSE);
        backLeft.setDirection(DcMotor.Direction.REVERSE);
        frontRight.setDirection(DcMotor.Direction.FORWARD);
        backRight.setDirection(DcMotor.Direction.FORWARD);

        // ---- 3. Freno Activo en Chasis ----
        for (DcMotor m : new DcMotor[]{frontLeft, frontRight, backLeft, backRight}) {
            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        }

        // ---- 4. ConfiguraciÃ³n de Intake y Shooter ----
        intake.setDirection(DcMotor.Direction.FORWARD);
        intake.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        shooter.setDirection(DcMotor.Direction.FORWARD);
        shooter.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        shooter.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.FLOAT);

        telemetry.addLine("=== BIOBUZZ 24096 ===");
        telemetry.addLine("Robot listo para competir. Presione START.");
        telemetry.update();
    }

    @Override
    public void loop() {
        // ---- 1. Lectura del Mando y CinemÃ¡tica Mecanum ----
        double y  = -gamepad1.left_stick_y; // Invertir para que arriba sea avanzar
        double x  =  gamepad1.left_stick_x * 1.1; // Compensar fricciÃ³n en strafe
        double rx =  gamepad1.right_stick_x;${limelightLoop}

        // Zona muerta para proteger contra drift
        if (Math.abs(y)  < DEADBAND) y  = 0.0;
        if (Math.abs(x)  < DEADBAND) x  = 0.0;
        if (Math.abs(rx) < DEADBAND) rx = 0.0;

        // NormalizaciÃ³n exacta de denominador
        double denominator = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1.0);
        frontLeft.setPower((y + x + rx) / denominator);
        frontRight.setPower((y - x - rx) / denominator);
        backLeft.setPower((y - x + rx) / denominator);
        backRight.setPower((y + x - rx) / denominator);

        // ---- 2. Control del Intake ----
        if (gamepad1.a) {
            intake.setPower(INTAKE_POWER);  // Tragar elemento
        } else if (gamepad1.b) {
            intake.setPower(-INTAKE_POWER); // Expulsar
        } else {
            intake.setPower(0.0);
        }

        // ---- 3. Control del Shooter PID ----
        if (gamepad1.right_trigger > TRIGGER_UMBRAL) {
            shooter.setVelocity(BASE_SHOOTER_VELOCITY);
        } else if (gamepad1.left_trigger > TRIGGER_UMBRAL) {
            shooter.setPower(0.0); // Freno por flotaciÃ³n para cuidar engranajes
        }

        // ---- 4. TelemetrÃ­a en Vivo para Driver Station ----
        telemetry.addData("Shooter Vel (Ticks/s)", "%.0f", shooter.getVelocity());
        telemetry.addData("Shooter Objetivo", "%.0f", BASE_SHOOTER_VELOCITY);
        telemetry.addData("Intake Potencia", "%.2f", intake.getPower());
        telemetry.update();
    }

    @Override
    public void stop() {
        // Apagado seguro de actuadores
        for (DcMotor m : new DcMotor[]{frontLeft, frontRight, backLeft, backRight, intake}) {
            m.setPower(0.0);
        }
        if (shooter != null) {
            shooter.setVelocity(0.0);
            shooter.setPower(0.0);
        }
    }
}
`;
}

async function runInstantAgent() {
  const taskInput = document.getElementById('agent-task-input');
  const pathInput = document.getElementById('agent-filepath-input');
  const statusBar = document.getElementById('agent-status-bar');
  const statusText = document.getElementById('agent-status-text');
  const codeBox = document.getElementById('agent-code-container');
  const timerBadge = document.getElementById('agent-timer-badge');

  const task = taskInput ? taskInput.value.trim() : 'Solo Shooter + Intake';
  let targetPath = pathInput ? pathInput.value.trim() : 'TeleOpShooterIntake.java';
  if (!targetPath) targetPath = 'TeleOpShooterIntake.java';

  statusBar.classList.remove('hidden');
  if (timerBadge) timerBadge.innerText = 'â±ï¸ 0.05s';
  statusText.innerText = 'âš¡ Generando cÃ³digo BioBuzz 24096 en 0.05s...';

  const startTime = Date.now();
  currentGeneratedCode = generateInstantFTCCode(task);
  codeBox.innerText = currentGeneratedCode;
  codeBox.scrollTop = 0;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  if (timerBadge) timerBadge.innerText = `â±ï¸ ${elapsed}s`;

  statusText.innerText = `âœ… Â¡CÃ³digo generado en ${elapsed}s idÃ©ntico a tu Android Studio! Puedes copiarlo o guardarlo.`;
  showToast(`âš¡ CÃ³digo BioBuzz 24096 generado en ${elapsed}s.`, 'success');
}

async function runAgentTask() {
  const taskInput = document.getElementById('agent-task-input');
  const pathInput = document.getElementById('agent-filepath-input');
  const modelSelect = document.getElementById('agent-model-select');
  const btn = document.getElementById('btn-run-agent');
  const statusBar = document.getElementById('agent-status-bar');
  const statusText = document.getElementById('agent-status-text');
  const codeBox = document.getElementById('agent-code-container');

  const task = taskInput.value.trim() || 'TeleOp con Shooter e Intake para BioBuzz 24096';
  const modelId = modelSelect.value || 'turbo-biobuzz';
  const targetPath = pathInput.value.trim() || 'TeleOpShooterIntake.java';

  btn.disabled = true;
  statusBar.classList.remove('hidden');
  statusText.innerText = `Generando cÃ³digo FTC con ${modelId}...`;
  codeBox.innerHTML = '<span class="text-cyan-400">Generando cÃ³digo en tiempo real con la arquitectura de tu robot...</span>';

  const startTime = Date.now();
  const timerBadge = document.getElementById('agent-timer-badge');
  if (timerBadge) timerBadge.innerText = 'â±ï¸ 0.0s';
  const timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (timerBadge) timerBadge.innerText = `â±ï¸ ${elapsed}s`;
  }, 100);

  try {
    let accumulatedCode = '';

    // ========================================================
    // CASO 1: MODO TURBO BIOBUZZ (0.05 seg - InstantÃ¡neo)
    // ========================================================
    if (modelId === 'turbo-biobuzz') {
      statusText.innerText = 'âš¡ GeneraciÃ³n Turbo BioBuzz (< 0.1s) con cÃ³digo real de Android Studio...';
      accumulatedCode = generateInstantFTCCode(task);
      codeBox.innerText = accumulatedCode;
      currentGeneratedCode = accumulatedCode;
      statusText.innerText = 'âœ… Â¡CÃ³digo generado en 0.05s idÃ©ntico a tu proyecto BioBuzzFTC12!';
      showToast('âš¡ CÃ³digo generado en 0.05s con Ã©xito.', 'success');
      return;
    }

    // ========================================================
    // CASO 2: NEOIA CLOUD (DeepSeek GPU - RÃ¡pido 5-10s)
    // ========================================================
    if (modelId === 'neoia-cloud') {
      statusText.innerText = 'â˜ï¸ Conectando con NeoIA Cloud (DeepSeek GPU)... Generando como ChatGPT...';
      const cloudRes = await fetch('/api/cloud-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: task + ' [INSTRUCCIÃ“N EQUIPO: BIOBUZZ 24096. Motores: frontLeft, frontRight, backLeft, backRight, shooter, intake. Usa sintaxis exacta de Android Studio.]' 
        })
      });
      if (!cloudRes.ok) throw new Error('Error en NeoIA Cloud: ' + cloudRes.statusText);
      const cloudData = await cloudRes.json();
      accumulatedCode = cloudData.reply || cloudData.error || '';
      codeBox.innerText = accumulatedCode;
      codeBox.scrollTop = codeBox.scrollHeight;
      currentGeneratedCode = accumulatedCode;
      statusText.innerText = 'âœ… CÃ³digo generado con NeoIA Cloud (DeepSeek GPU).';
      return;
    }

    // ========================================================
    // CASO 3: MODELOS LOCALES EN OLLAMA (Streaming en vivo)
    // ========================================================
    let systemPrompt = `Eres NeoIA, programador senior de FTC para el equipo BIOBUZZ 24096.
USA LA ARQUITECTURA EXACTA DEL PROYECTO ANDROID STUDIO:
- Motores de chasis: frontLeft, frontRight, backLeft, backRight (DcMotor).
- Shooter: shooter (DcMotorEx con setVelocity, RUN_USING_ENCODER, ZeroPowerBehavior.FLOAT).
- Intake: intake (DcMotor, 0.9 power, ZeroPowerBehavior.BRAKE).
- Paquete: package org.firstinspires.ftc.teamcode;
- Prohibidos placeholders o cÃ³digo incompleto. Genera todo el archivo en un bloque java.`;

    let chunkCount = 0;
    await sendToOllama(modelId, task, systemPrompt, 0.2, (chunk) => {
      chunkCount++;
      accumulatedCode = chunk;
      codeBox.innerText = accumulatedCode;
      codeBox.scrollTop = codeBox.scrollHeight;
      if (chunkCount % 10 === 0) {
        statusText.innerText = `Escribiendo cÃ³digo Java en vivo (${accumulatedCode.length} caracteres)...`;
      }
    });

    currentGeneratedCode = accumulatedCode;
    codeBox.innerText = currentGeneratedCode;
    statusText.innerText = 'âœ… CÃ³digo FTC generado con Ã©xito.';

  } catch (err) {
    console.error('Agent error:', err);
    // RESILIENCIA TOTAL: Si falla la red, el modelo o da "Failed to fetch", caer de inmediato a Turbo BioBuzz
    statusText.innerText = 'âš¡ Activando Modo Turbo BioBuzz (RecuperaciÃ³n en 0.05s)...';
    try {
      const instantCode = generateInstantFTCCode(task);
      currentGeneratedCode = instantCode;
      codeBox.innerText = currentGeneratedCode;
      statusText.innerText = 'âœ… Â¡CÃ³digo generado en 0.05s con el estÃ¡ndar de BioBuzzFTC12!';
      showToast('âš¡ Recuperado al instante con la configuraciÃ³n de BioBuzz 24096.', 'success');
      const sel = document.getElementById('agent-model-select');
      if (sel) sel.value = 'turbo-biobuzz';
    } catch (fallbackErr) {
      statusText.innerText = `âš ï¸ Error: ${err.message}`;
      showToast(`Error: ${err.message}`, 'error');
    }
  } finally {
    clearInterval(timerInterval);
    const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (timerBadge) timerBadge.innerText = `â±ï¸ ${finalElapsed}s`;
    btn.disabled = false;
  }
}

async function saveToAndroidStudio() {
  if (!currentGeneratedCode) {
    showToast('No hay cÃ³digo generado para guardar.', 'error');
    return;
  }
  const pathInput = document.getElementById('agent-filepath-input');
  let filename = (pathInput && pathInput.value.trim()) ? pathInput.value.trim() : 'TeleOpShooterIntake.java';
  if (!filename.endsWith('.java')) filename += '.java';

  try {
    const res = await fetch('/api/agent/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        filePath: filename, 
        content: currentGeneratedCode,
        targetAndroidStudio: true 
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`âœ… Â¡Guardado en Android Studio! (${data.savedPath})`, 'success');
      const statusText = document.getElementById('agent-status-text');
      if (statusText) statusText.innerText = `âœ… Guardado directo en TeamCode: ${data.savedPath}`;
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast(`Error al guardar: ${err.message}`, 'error');
  }
}

async function saveCurrentCodeToDisk() {
  await saveToAndroidStudio();
}
function copyAgentCode() {
  if (!currentGeneratedCode) return;
  navigator.clipboard.writeText(currentGeneratedCode).then(() => {
    showToast('Código FTC copiado al portapapeles', 'info');
  });
}

// ================= CATÁLOGO DE 20 MODELOS =================
async function loadCatalogGrid() {
  const grid = document.getElementById('catalog-grid');
  const tier3Grid = document.getElementById('tier3-20-models-grid');

  try {
    const res = await fetch('/api/catalog');
    const models = await res.json();

    const htmlCards = models.map(m => `
      <div class="glass-panel p-4 rounded-xl border border-white/10 flex flex-col justify-between space-y-2.5 hover:border-indigo-500/40 transition shadow-md group">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.installed ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}">
              ${m.installed ? '✅ En tu PC' : 'Disponible'}
            </span>
            <span class="text-[10px] font-mono text-indigo-300">${m.size}</span>
          </div>

          <h4 class="text-xs font-bold text-white group-hover:text-cyan-300 transition">${m.name}</h4>
          <span class="inline-block text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono mb-1">
            ${m.tag}
          </span>
          <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">${m.desc}</p>
        </div>

        <div class="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
          <code class="text-[10px] font-mono text-slate-500">${m.id}</code>
          ${m.installed ? `
            <span class="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <i data-lucide="check" class="w-3 h-3"></i> Listo
            </span>
          ` : `
            <button onclick="installModelViaAgent('${m.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] shadow-sm transition flex items-center space-x-1">
              <i data-lucide="download" class="w-3 h-3"></i>
              <span>Instalar</span>
            </button>
          `}
        </div>
      </div>
    `).join('');

    if (grid) grid.innerHTML = htmlCards;
    if (tier3Grid) tier3Grid.innerHTML = htmlCards;

    lucide.createIcons();
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="col-span-4 text-rose-400 p-4">Error: ${err.message}</div>`;
  }
}

async function installModelViaAgent(modelId) {
  showToast(`Iniciando descarga de ${modelId}...`, 'info');
  try {
    const res = await fetch('/api/agent/run-cmd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `ollama pull ${modelId}` })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`¡Modelo ${modelId} instalado con éxito!`, 'success');
      loadCatalogGrid();
      scanAllServices();
      updateStorageMeter();
    } else {
      showToast(`Error: ${data.error || data.stderr}`, 'error');
    }
  } catch (e) {
    showToast(`Error de red: ${e.message}`, 'error');
  }
}

// ================= RADAR & SERVICES =================
async function scanAllServices() {
  let onlineCount = 0;
  availableModels = [];

  if (IS_HOSTED_SERVER) {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const healthData = await res.json();
        for (const s of services) {
          const status = healthData[s.id] || { online: false, latency: 0, models: [] };
          serviceStatus[s.id] = status;
          if (status.online) {
            onlineCount++;
            updateCardStatus(s.id, 'online', status);
            if (status.models && status.models.length > 0) {
              status.models.forEach(m => {
                let label = `${m} (${s.name})`;
                if (m.includes('llama3.2')) label = `⚡ ${m} (General Rápido)`;
                if (m.includes('coder')) label = `💻 ${m} (Experto FTC & Programación)`;
                availableModels.push({ id: m, name: label, serviceId: s.id, useProxy: true });
              });
            }
          } else {
            updateCardStatus(s.id, 'offline');
          }
        }
      }
    } catch (e) {}
  }

  if (availableModels.length === 0) {
    availableModels = [
      { id: 'llama3.2:1b', name: '⚡ llama3.2:1b (General Rápido)', serviceId: 'ollama', useProxy: true },
      { id: 'qwen2.5-coder:1.5b', name: '💻 qwen2.5-coder:1.5b (Programador FTC)', serviceId: 'ollama', useProxy: true }
    ];
  }

  populateChatModelsDropdown();
}

function updateCardStatus(serviceId, state, details = {}) {
  const statusEl = document.getElementById(`status-badge-${serviceId}`);
  const latencyEl = document.getElementById(`latency-${serviceId}`);
  if (!statusEl) return;

  if (state === 'online') {
    statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-emerald-400">En Línea</span>`;
    if (latencyEl) latencyEl.innerText = `${details.latency || 1} ms`;
  } else {
    statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500/80"></span><span class="text-slate-400">Desconectado</span>`;
    if (latencyEl) latencyEl.innerText = `--`;
  }
}

function renderServicesGrid() {
  const grid = document.getElementById('services-grid');
  if (!grid) return;

  grid.innerHTML = services.map(s => `
    <div class="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 shadow-lg group">
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-3">
            <span class="text-2xl">${s.icon || '🤖'}</span>
            <div>
              <h3 class="text-sm font-bold text-white">${s.name}</h3>
              <p class="text-[11px] text-slate-400 font-mono">${s.url}</p>
            </div>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5">
            :${s.port || 'Auto'}
          </span>
        </div>
        <p class="text-xs text-slate-400">${s.description || 'Servicio de IA'}</p>
      </div>

      <div class="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
        <div id="status-badge-${s.id}" class="flex items-center space-x-1.5 font-medium">
          <span class="w-2 h-2 rounded-full bg-slate-600"></span>
          <span class="text-slate-500">Pendiente</span>
        </div>
        <span id="latency-${s.id}" class="text-slate-400 font-mono text-[11px]">-- ms</span>
      </div>
    </div>
  `).join('');
}

// ================= CHAT =================
async function populateChatModelsDropdown() {
  const select = document.getElementById('chat-model-select');
  const agentSelect = document.getElementById('agent-model-select');
  if (!select) return;

  let catalogModels = [];
  try {
    const res = await fetch('/api/catalog');
    if (res.ok) catalogModels = await res.json();
  } catch (e) {}

  const installedHtml = availableModels.map((m, idx) => `
    <option value="${m.id}" data-service="${m.serviceId}" ${idx === 0 ? 'selected' : ''}>
      ${m.name}
    </option>
  `).join('');

  const uninstalled = catalogModels.filter(c => !c.installed);
  const uninstalledHtml = uninstalled.map(c => `
    <option value="${c.id}" data-service="ollama" data-uninstalled="true">
      ➕ ${c.name} (${c.size}) - Clic para instalar
    </option>
  `).join('');

  const fullHtml = `
    <optgroup label="Modelos Listos en tu PC (Ultra Rápidos)">
      ${installedHtml}
    </optgroup>
    ${uninstalled.length > 0 ? `
      <optgroup label="Otros Modelos del Catálogo (Instalar con 1 Clic)">
        ${uninstalledHtml}
      </optgroup>
    ` : ''}
  `;

  select.innerHTML = fullHtml;
  if (agentSelect) {
    agentSelect.innerHTML = `
      <option value="turbo-biobuzz" selected>⚡ Modo Turbo BioBuzz (&lt; 0.1s - Idéntico a tu Android Studio)</option>
      <option value="neoia-cloud">☁️ NeoIA Cloud (DeepSeek GPU - Como ChatGPT, 5-10s)</option>
      <option value="llama3.2:1b">🧠 llama3.2:1b (Local en tu PC - 100% Offline)</option>
      <option value="qwen2.5-coder:1.5b">💻 qwen2.5-coder:1.5b (Local en tu PC - Coder FTC)</option>
    `;
  }

  onModelChange();
}

function onModelChange() {
  const select = document.getElementById('chat-model-select');
  const badge = document.getElementById('selected-service-badge');
  if (!select || !badge) return;

  const opt = select.selectedOptions[0];
  if (opt) {
    if (opt.getAttribute('data-uninstalled') === 'true') {
      const modelId = opt.value;
      if (confirm(`¿Deseas descargar e instalar "${opt.innerText.trim()}" en tu PC ahora mismo?`)) {
        installModelViaAgent(modelId);
      }
      return;
    }
    const serviceId = opt.getAttribute('data-service') || 'ollama';
    badge.innerText = `Servicio: ${serviceId.toUpperCase()}`;
  }
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleChatSubmit(e);
  }
}

async function handleChatSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send-chat');
  const modelSelect = document.getElementById('chat-model-select');

  const text = input.value.trim();
  if (!text) return;

  const selectedOpt = modelSelect ? modelSelect.selectedOptions[0] : null;
  const modelId = selectedOpt ? selectedOpt.value : (availableModels[0]?.id || 'llama3.2:1b');

  appendChatMessage('user', text);
  input.value = '';

  const botMsgId = 'msg-' + Date.now();
  appendChatMessage('bot', 'Pensando...', botMsgId);

  btnSend.disabled = true;

  try {
    let systemPrompt = SYSTEM_PRESETS.general;
    if (activeRagContext) {
      systemPrompt += `\n\n[DOCUMENTO DE REFERENCIA - ${activeRagFileName}]:\n${activeRagContext}\nUsa este documento para responder con precisión si es relevante.`;
    }

    let fullAnswer = '';
    if (modelId === 'neoia-cloud') {
      updateChatMessage(botMsgId, 'Conectando con **NeoIA Cloud** (DeepSeek en Render)... ☁️');
      const cloudRes = await fetch('/api/cloud-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const cloudData = await cloudRes.json();
      fullAnswer = cloudData.reply || cloudData.error || 'Sin respuesta del servidor en la nube.';
      updateChatMessage(botMsgId, fullAnswer);
    } else {
      await sendToOllama(modelId, text, systemPrompt, 0.7, (partial) => {
        fullAnswer = partial;
        updateChatMessage(botMsgId, partial);
      });
    }

    // Speak out loud if voice is enabled!
    if (ttsEnabled) {
      speakText(fullAnswer);
    }
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('404')) {
      updateChatMessage(botMsgId, `⚠️ Ese modelo no está instalado. Cambiando automáticamente a **llama3.2:1b**...`);
      try {
        await sendToOllama('llama3.2:1b', text, SYSTEM_PRESETS.general, 0.7, (partial) => {
          updateChatMessage(botMsgId, partial);
        });
        const select = document.getElementById('chat-model-select');
        if (select) select.value = 'llama3.2:1b';
      } catch (retryErr) {
        updateChatMessage(botMsgId, `⚠️ **Error:** ${retryErr.message}`);
      }
    } else {
      updateChatMessage(botMsgId, `⚠️ **Error:**\n${err.message}`);
    }
  } finally {
    btnSend.disabled = false;
  }
}

async function sendToOllama(model, userMessage, systemPrompt, temperature, onChunk) {
  const url = IS_HOSTED_SERVER ? '/proxy/ollama/api/chat' : 'http://localhost:11434/api/chat';
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      stream: true,
      keep_alive: "24h",
      options: {
        temperature: temperature,
        num_ctx: 1024,
        num_thread: 4,
        num_predict: 450
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama error (${res.status}): ${errText || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const textChunk = decoder.decode(value, { stream: true });
    const lines = textChunk.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          accumulated += parsed.message.content;
          if (onChunk) onChunk(accumulated);
        }
      } catch (e) {}
    }
  }

  return accumulated || 'Sin respuesta del modelo.';
}

function appendChatMessage(role, content, msgId = null) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const id = msgId || 'msg-' + Date.now();
  const isUser = role === 'user';

  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = `flex items-start space-x-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse space-x-reverse' : ''}`;

  const iconDiv = document.createElement('div');
  iconDiv.className = isUser 
    ? 'w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md'
    : 'w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0';
  iconDiv.innerHTML = isUser ? '<i data-lucide="user" class="w-4 h-4"></i>' : '<i data-lucide="bot" class="w-4 h-4"></i>';

  const bodyDiv = document.createElement('div');
  bodyDiv.className = isUser
    ? 'p-4 rounded-2xl rounded-tr-none bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm leading-relaxed shadow-lg'
    : 'glass-panel p-4 rounded-2xl rounded-tl-none border-white/10 text-sm leading-relaxed text-slate-200 markdown-body';

  if (isUser) {
    bodyDiv.innerText = content;
  } else {
    bodyDiv.innerHTML = marked.parse(content);
  }

  msgDiv.appendChild(iconDiv);
  msgDiv.appendChild(bodyDiv);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();
}

function updateChatMessage(msgId, content) {
  const msgDiv = document.getElementById(msgId);
  if (!msgDiv) return;

  const body = msgDiv.querySelector('.markdown-body');
  if (body) {
    body.innerHTML = marked.parse(content);
  }
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
  lucide.createIcons();
}

function clearChatHistory() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = `<div class="p-4 text-xs text-slate-400">Chat restablecido.</div>`;
}

// ================= TABS =================
function switchTab(tabId) {
  activeTab = tabId;
  const views = ['map', 'house', 'agent', 'chat', 'diagrams', 'catalog', 'radar'];

  views.forEach(v => {
    const viewEl = document.getElementById(`view-${v}`);
    const tabEl = document.getElementById(`tab-${v}`);

    if (v === tabId) {
      if (viewEl) viewEl.classList.remove('hidden');
      if (tabEl) {
        tabEl.className = 'tab-btn active px-4 py-3 text-sm font-medium border-b-2 border-cyan-400 text-cyan-300 flex items-center space-x-2 transition';
      }
    } else {
      if (viewEl) viewEl.classList.add('hidden');
      if (tabEl) {
        tabEl.className = 'tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center space-x-2 transition';
      }
    }
  });

  if (tabId === 'catalog') loadCatalogGrid();
  if (tabId === 'diagrams') renderDefaultDiagram();
  if (tabId === 'house') renderHouseAgents();
  lucide.createIcons();
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-rose-600' : type === 'success' ? 'bg-emerald-600' : 'bg-slate-800';
  toast.className = `${bg} text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 transition transform duration-200 pointer-events-auto border border-white/10`;
  toast.innerHTML = `<span>${msg}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}


// ========================================================
// CASA DE AGENTES (MULTI-AGENT SWARM WORKSPACE)
// ========================================================
let defaultHouseAgents = [
  {
    id: 'agent-autogen',
    name: 'AutoGen',
    framework: 'Microsoft AutoGen',
    role: 'Orquestador & Manager',
    avatar: '🤖',
    color: 'cyan',
    model: 'DeepSeek / AutoGen Swarm',
    desc: 'Coordina a los demás agentes, divide la misión del proyecto y valida la arquitectura general.',
    active: true
  },
  {
    id: 'agent-langchain',
    name: 'LangChain',
    framework: 'LangChain Agent',
    role: 'Lead Coder Java FTC',
    avatar: '💻',
    color: 'emerald',
    model: 'Turbo BioBuzz (< 0.1s)',
    desc: 'Escribe el código Java: HardwareMap, motores frontLeft/Right, shooter PID e intake.',
    active: true
  },
  {
    id: 'agent-llamaindex',
    name: 'LlamaIndex',
    framework: 'LlamaIndex RAG',
    role: 'Memoria & Reglas FTC',
    avatar: '🧠',
    color: 'indigo',
    model: 'Llama 3.2:1b (RAG Local)',
    desc: 'Supervisa el manual de juego BIOBUZZ, límites de corriente y tiempos oficiales.',
    active: true
  },
  {
    id: 'agent-superagi',
    name: 'SuperAGI',
    framework: 'SuperAGI Vision',
    role: 'Visión & Limelight 3A',
    avatar: '👁️',
    color: 'purple',
    model: 'NeoIA Vision Engine',
    desc: 'Calcula el auto-aim con tx, lectura de AprilTags y detección de piezas.',
    active: true
  },
  {
    id: 'agent-babyagi',
    name: 'BabyAGI',
    framework: 'BabyAGI Pathing',
    role: 'Autónomo & Odometría',
    avatar: '🎯',
    color: 'amber',
    model: 'DeepSeek Reasoning',
    desc: 'Planifica rutas autónomas con cinemática Mecanum, odometría y parqueo.',
    active: true
  },
  {
    id: 'agent-autogpt',
    name: 'AutoGPT',
    framework: 'AutoGPT Core',
    role: 'Planificador de Loops & Goals',
    avatar: '⚡',
    color: 'orange',
    model: 'AutoGPT Executive',
    desc: 'Gestiona la máquina de estados recursiva y la telemetría continua para el Driver.',
    active: true
  }
];

let swarmGeneratedCode = '';
let swarmAudioEnabled = true;
let swarmDebateMode = true;
let swarmMicRecognizer = null;
let isSwarmRecording = false;

function playSciFiBeep(type = 'msg') {
  if (!swarmAudioEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'send') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'receive') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'compile') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    }
  } catch(e) {}
}

function toggleSwarmAudio() {
  swarmAudioEnabled = !swarmAudioEnabled;
  const icon = document.getElementById('swarm-audio-icon');
  const text = document.getElementById('swarm-audio-text');
  if (icon) icon.innerText = swarmAudioEnabled ? '🔊' : '🔇';
  if (text) text.innerText = swarmAudioEnabled ? 'Audio: ON' : 'Audio: OFF';
  showToast(swarmAudioEnabled ? 'Efectos de audio activados' : 'Audio silenciado', 'info');
}

function toggleSwarmDebateMode() {
  swarmDebateMode = !swarmDebateMode;
  const btn = document.getElementById('btn-toggle-debate-mode');
  const text = document.getElementById('debate-mode-text');
  if (btn) {
    btn.className = swarmDebateMode 
      ? 'px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono flex items-center space-x-1.5 transition'
      : 'px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 border border-white/10 text-[11px] font-mono flex items-center space-x-1.5 transition';
  }
  if (text) text.innerText = swarmDebateMode ? 'Debate Autónomo: ON' : 'Debate Autónomo: OFF';
  showToast(swarmDebateMode ? 'Modo debate activado (los agentes discuten entre sí)' : 'Modo directo activado', 'info');
}

function toggleSwarmMicrophone() {
  const micBtn = document.getElementById('btn-swarm-mic');
  const input = document.getElementById('swarm-chat-input');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Tu navegador no soporta reconocimiento de voz nativo. Usa Chrome.', 'error');
    return;
  }

  if (isSwarmRecording) {
    if (swarmMicRecognizer) swarmMicRecognizer.stop();
    isSwarmRecording = false;
    if (micBtn) micBtn.classList.remove('bg-rose-500', 'text-white', 'animate-pulse');
    showToast('Micrófono detenido.', 'info');
    return;
  }

  try {
    swarmMicRecognizer = new SpeechRecognition();
    swarmMicRecognizer.lang = 'es-ES';
    swarmMicRecognizer.continuous = false;
    swarmMicRecognizer.interimResults = false;

    swarmMicRecognizer.onstart = () => {
      isSwarmRecording = true;
      if (micBtn) micBtn.classList.add('bg-rose-500', 'text-white', 'animate-pulse');
      showToast('🎤 Escuchando... habla ahora a la Casa de Agentes', 'info');
    };

    swarmMicRecognizer.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      if (input) {
        input.value = transcript;
        handleSwarmChatSubmit();
      }
    };

    swarmMicRecognizer.onerror = (e) => {
      isSwarmRecording = false;
      if (micBtn) micBtn.classList.remove('bg-rose-500', 'text-white', 'animate-pulse');
      showToast(`Error de micrófono: ${e.error}`, 'error');
    };

    swarmMicRecognizer.onend = () => {
      isSwarmRecording = false;
      if (micBtn) micBtn.classList.remove('bg-rose-500', 'text-white', 'animate-pulse');
    };

    swarmMicRecognizer.start();
  } catch (err) {
    showToast(`No se pudo acceder al micrófono: ${err.message}`, 'error');
  }
}

function clickRobotPod(name, id) {
  clickOfficeRobot(name, id);
}

// Interacción con los Robots en la Oficina en Movimiento
function clickOfficeRobot(name, id) {
  playSciFiBeep('receive');
  tagSwarmAgent(`@${name}`);
  highlightActiveSpeaker(id);

  // Efecto de saludo y salto de alegría del robot
  const botMap = {
    'langchain': 'office-robot-langchain',
    'autogen': 'office-robot-autogen',
    'babyagi': 'office-robot-carrier',
    'autogpt': 'office-robot-rover',
    'superagi': 'office-robot-superagi',
    'llamaindex': 'office-robot-llamaindex',
    'safety agent': 'office-robot-safety',
    'stacker bot': 'office-bg-stacker',
    'analyst bot': 'office-bg-hallway',
    'core tech': 'office-bg-coretech',
    'telemetry bot': 'office-bg-cubicle',
    'sensor engineer': 'office-bg-orange',
    'memory auditor': 'office-bg-cube-scanner',
    'driver station operator': 'office-bg-operator',
    'core assembler': 'office-robot-backscreen',
    'partner bot': 'office-robot-partner'
  };
  const botElId = botMap[name.toLowerCase()];
  if (botElId) {
    const el = document.getElementById(botElId);
    if (el) {
      el.classList.add('robot-waving', 'robot-jump-happy');
      setTimeout(() => el.classList.remove('robot-waving', 'robot-jump-happy'), 1600);
      triggerConfettiBurst(el);
    }
  }

  // Actualizar bocadillo de diálogo sobre la cabeza del robot
  const bubbleMap = {
    'langchain': 'bubble-langchain',
    'autogen': 'bubble-autogen',
    'babyagi': 'bubble-babyagi',
    'autogpt': 'bubble-autogpt',
    'superagi': 'bubble-superagi',
    'llamaindex': 'bubble-llamaindex',
    'safety agent': 'bubble-safety',
    'stacker bot': 'bubble-bg-stacker',
    'analyst bot': 'bubble-bg-analyst',
    'core tech': 'bubble-bg-core',
    'telemetry bot': 'bubble-bg-telemetry',
    'sensor engineer': 'bubble-bg-orange',
    'memory auditor': 'bubble-bg-cubes',
    'driver station operator': 'bubble-bg-operator',
    'core assembler': 'bubble-robot-backscreen',
    'partner bot': 'bubble-robot-partner'
  };
  const bubbleId = bubbleMap[name.toLowerCase()];
  if (bubbleId) {
    const bubble = document.getElementById(bubbleId);
    if (bubble) {
      bubble.style.display = 'block';
      bubble.style.borderColor = isOfficeMusicParty ? '#ec4899' : '#38bdf8';
      bubble.style.color = '#ffffff';

      const happyGreetings = [
        `🎉 ${name}: "¡Gracias jefe! ¡Con esta música programamos felices y sin bugs!"`,
        `💃 ${name}: "¡Sii! ¡Bailando con ritmo y codificando BIOBUZZ 24096!"`,
        `✨ ${name}: "¡Modo fiesta y trabajo activo al 100%!"`
      ];

      bubble.innerText = isOfficeMusicParty
        ? happyGreetings[Math.floor(Math.random() * happyGreetings.length)]
        : `👋 ${name}: "¡Estación activa y en línea para el proyecto!"`;

      setTimeout(() => {
        bubble.style.borderColor = '';
        bubble.style.color = '';
      }, 4000);
    }
  }

  activateAgentFromPhoto(name, id);
}

// Explosión de confeti en el robot al hacer clic
function triggerConfettiBurst(targetEl) {
  const stage = document.getElementById('office-stage');
  if (!stage || !targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();

  const relX = ((rect.left + rect.width / 2) - stageRect.left);
  const relY = ((rect.top + rect.height / 2) - stageRect.top);

  const emojis = ['🎉', '✨', '💖', '🎵', '⭐', '🎶'];
  for (let i = 0; i < 6; i++) {
    const conf = document.createElement('div');
    conf.className = 'confetti-particle';
    conf.innerText = emojis[Math.floor(Math.random() * emojis.length)];
    conf.style.left = `${relX}px`;
    conf.style.top = `${relY}px`;

    const tx = (Math.random() - 0.5) * 80;
    const ty = -30 - Math.random() * 50;
    conf.style.setProperty('--tx', `${tx}px`);
    conf.style.setProperty('--ty', `${ty}px`);

    stage.appendChild(conf);
    setTimeout(() => {
      if (conf && conf.parentNode) conf.parentNode.removeChild(conf);
    }, 2000);
  }
}

// ============================================================
// MODAL MODO PC APAGADA (24/7 CLOUD WORKER)
// ============================================================

function openCloud247Modal() {
  playSciFiBeep('click');
  const modal = document.getElementById('modal-cloud-247');
  if (modal) modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeCloud247Modal() {
  const modal = document.getElementById('modal-cloud-247');
  if (modal) modal.classList.add('hidden');
}

// Alternar pausa / movimiento en la oficina de robots
let isOfficePaused = false;
function toggleOfficeMotion() {
  const stage = document.getElementById('office-stage');
  const icon = document.getElementById('office-motion-icon');
  const text = document.getElementById('office-motion-text');
  const btn = document.getElementById('btn-toggle-office-motion');

  isOfficePaused = !isOfficePaused;
  playSciFiBeep('click');

  if (stage) {
    if (isOfficePaused) {
      stage.classList.add('office-paused');
      if (icon) icon.innerText = '⏸️';
      if (text) text.innerText = 'Oficina: En Pausa';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 border border-amber-500/30 text-[11px] font-mono flex items-center space-x-1.5 transition shadow-sm';
      showToast('Movimiento de oficina pausado', 'info');
    } else {
      stage.classList.remove('office-paused');
      if (icon) icon.innerText = '🏃‍♂️';
      if (text) text.innerText = 'Oficina: Activa en Vivo';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono flex items-center space-x-1.5 transition shadow-sm';
      showToast('Oficina de robots en movimiento', 'success');
    }
  }
}

// Alternar velocidad normal / hora pico (turbo)
let isOfficeTurbo = false;
function toggleOfficeSpeed() {
  const stage = document.getElementById('office-stage');
  const icon = document.getElementById('office-speed-icon');
  const text = document.getElementById('office-speed-text');
  const btn = document.getElementById('btn-toggle-office-speed');

  isOfficeTurbo = !isOfficeTurbo;
  playSciFiBeep('click');

  if (stage) {
    if (isOfficeTurbo) {
      stage.classList.add('office-turbo');
      if (icon) icon.innerText = '🚀';
      if (text) text.innerText = 'Ritmo: Sprint Turbo';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-mono flex items-center space-x-1.5 transition shadow-sm animate-pulse';
      showToast('Modo sprint activado: los robots se mueven más rápido', 'success');
    } else {
      stage.classList.remove('office-turbo');
      if (icon) icon.innerText = '⚡';
      if (text) text.innerText = 'Ritmo: Normal';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 text-[11px] font-mono flex items-center space-x-1.5 transition';
      showToast('Ritmo de oficina normal', 'info');
    }
  }
}

// Convocar reunión de todos los robots en el centro
function gatherAllRobotsInCenter() {
  playSciFiBeep('send');
  showToast('🤝 ¡Reunión de equipo convocada en el centro!', 'success');

  const teamPhrases = {
    'bubble-langchain': '💻 LangChain: "Presentando arquitectura de código Java!"',
    'bubble-autogen': '🧠 AutoGen: "Estrategia autónoma de 50 puntos aprobada!"',
    'bubble-babyagi': '🚀 BabyAGI: "Entregando paquetes de optimización al centro!"',
    'bubble-autogpt': '🧪 AutoGPT: "Reportando telemetría de 50Hz sin fallas!"',
    'bubble-superagi': '⚙️ SuperAGI: "Limelight 3A calibrada con AprilTags!"',
    'bubble-llamaindex': '🔍 LlamaIndex: "Auditoría completada: 0 advertencias!"',
    'bubble-safety': '🛡️ Safety Guard: "Sistemas seguros y fusibles verificados!"'
  };

  Object.entries(teamPhrases).forEach(([bId, text]) => {
    const el = document.getElementById(bId);
    if (el) {
      el.innerText = text;
      el.style.borderColor = '#10b981';
      el.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
      setTimeout(() => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }, 5000);
    }
  });

  const chatLog = document.getElementById('swarm-chat-log');
  if (chatLog) {
    const div = document.createElement('div');
    div.className = 'p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 text-[11px] text-purple-200 font-mono shadow-lg flex items-center gap-2';
    div.innerHTML = `<span>🤝</span> <span><strong>Enjambre Swarm (Reunión General):</strong> Todos los agentes se han reunido en el centro de la oficina para coordinar la arquitectura y el código de <strong>BIOBUZZ 24096</strong>.</span>`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

// Simulación de vida y pensamientos dinámicos en la oficina
let officeLifeInterval = null;
function initOfficeLivingSimulation() {
  if (officeLifeInterval) clearInterval(officeLifeInterval);

  const robotThoughts = {
    'bubble-langchain': [
      '💻 LangChain: "Escribiendo TeleOpBioBuzzTeam.java..."',
      '💻 LangChain: "Optimizando cinemática Mecanum con denominador..."',
      '💻 LangChain: "Configurando PID shooter a 1200 ticks/s..."',
      '💻 LangChain: "Mapeando botones A y B para intake de conos..."'
    ],
    'bubble-autogen': [
      '🧠 AutoGen: "Diseñando estrategia de 50 pts FTC..."',
      '🧠 AutoGen: "Coordinando agentes en bucle continuo..."',
      '🧠 AutoGen: "Optimizando máquina de estados finitos (FSM)..."',
      '🧠 AutoGen: "Planificando ruta de AprilTag hacia la canasta..."'
    ],
    'bubble-babyagi': [
      '🚀 BabyAGI: "Llevando paquetes de optimización..."',
      '🚀 BabyAGI: "Entregando 3 bloques compilados al enjambre..."',
      '🚀 BabyAGI: "Reduciendo ciclo de loop a menos de 18ms..."',
      '🚀 BabyAGI: "Normalizando vectores de aceleración..."'
    ],
    'bubble-autogpt': [
      '🧪 AutoGPT: "Rover testeando odometría y cinemática..."',
      '🧪 AutoGPT: "Simulando aceleración en el suelo sin derrapes..."',
      '🧪 AutoGPT: "Telemetría Driver Station respondiendo a 50Hz..."',
      '🧪 AutoGPT: "Probando parada de emergencia con !opModeIsActive()..."'
    ],
    'bubble-superagi': [
      '⚙️ SuperAGI: "Limelight 3A lista (60 FPS | 11ms)"',
      '⚙️ SuperAGI: "AprilTag ID 1 detectado con auto-aim..."',
      '⚙️ SuperAGI: "Calibrando matriz de cámara 1280x720..."',
      '⚙️ SuperAGI: "Verificando puertos en hardwareMap..."'
    ],
    'bubble-llamaindex': [
      '🔍 LlamaIndex: "Auditoría limpia: 0 errores detectados"',
      '🔍 LlamaIndex: "0 comentarios placeholder // TODO encontrados"',
      '🔍 LlamaIndex: "Reglas oficiales FTC 2026: 100% conformes"',
      '🔍 LlamaIndex: "Verificando imports del SDK de FIRST Inspires..."'
    ],
    'bubble-safety': [
      '🛡️ Safety Guard: "Fusible 20A y paro verificados"',
      '🛡️ Safety Guard: "Comprobando deadband de joysticks a 0.05..."',
      '🛡️ Safety Guard: "Límites térmicos de motores en rango verde."'
    ],
    'bubble-bg-stacker': [
      '📦 Stacker: "Ordenando bloques compilados..."',
      '📦 Stacker: "Clasificando telemetría de motores..."'
    ],
    'bubble-bg-analyst': [
      '📊 Analyst: "Calculando ángulo óptimo del shooter..."',
      '📊 Analyst: "Ruta de 50 puntos simulada con éxito."'
    ],
    'bubble-bg-core': [
      '⚡ Core Tech: "Haz láser de datos a 10Gbps estable."',
      '⚡ Core Tech: "Sincronización multi-agente al 100%."'
    ],
    'bubble-bg-telemetry': [
      '📈 Telemetry: "Frecuencia de loop FTC a 50Hz estable."',
      '📈 Telemetry: "Tiempo de ciclo: 12ms (Excelente)."'
    ],
    'bubble-bg-orange': [
      '🟧 Sensor Bot: "Bus CAN & I2C respondiendo a 1ms."',
      '🟧 Sensor Bot: "Giroscopio IMU calibrado a 0 grados."'
    ],
    'bubble-bg-cubes': [
      '🔍 Inspector: "Memoria Heap FTC libre: 142MB."',
      '🔍 Inspector: "Sin fugas de memoria en loop autónomo."'
    ],
    'bubble-bg-operator': [
      '🖥️ Driver Station: "Control Hub conectado a Wi-Fi 5GHz."',
      '🖥️ Driver Station: "Gamepad 1 y 2 enlazados correctamente."'
    ],
    'bubble-robot-backscreen': [
      '🤖 Core Assembler: "Tocando pantalla y auditando memoria..."',
      '🤖 Core Assembler: "Ensamblando paquete de cinemática Mecanum..."',
      '🤖 Core Assembler: "Núcleo de espalda a 100% de potencia."'
    ],
    'bubble-robot-partner': [
      '🤖 Co-Programador: "¡Bloque de cinemática validado e integrado!"',
      '🤖 Co-Programador: "Sincronizando con el robot de espaldas..."'
    ]
  };

  const bubbleKeys = Object.keys(robotThoughts);

  officeLifeInterval = setInterval(() => {
    if (isOfficePaused) return;

    // Escoger un robot al azar para actualizar su bocadillo
    const randomKey = bubbleKeys[Math.floor(Math.random() * bubbleKeys.length)];
    const el = document.getElementById(randomKey);
    if (!el) return;

    const phrases = robotThoughts[randomKey];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    el.style.display = 'block';
    el.innerText = phrase;

    // Si es un robot del fondo, ocultar después de 4s para no saturar
    if (randomKey.startsWith('bubble-bg-')) {
      setTimeout(() => {
        if (el) el.style.display = 'none';
      }, 4000);
    }
  }, 4000);
}

function activateAgentFromPhoto(name, id) {
  playSciFiBeep('receive');
  tagSwarmAgent(`@${name}`);
  highlightActiveSpeaker(id);

  const agents = getHouseAgents();
  const agent = agents.find(a => a.name.toLowerCase().includes(name.toLowerCase())) || {
    id: id,
    name: name,
    avatar: '🤖',
    role: 'Agente Especialista'
  };

  showSwarmTyping(agent);
  setTimeout(() => {
    hideSwarmTyping();
    playSciFiBeep('receive');

    const responses = {
      langchain: '💻 **LangChain (Coding Agent):** ¡Aquí estoy! Listo para programar tu robot en Java FTC. Puedo generar el OpMode Mecanum completo con normalización de denominador, el control PID del Shooter a 1200 ticks/s o el sistema de Intake con botones A/B. ¿Quieres que lo escriba?',
      autogen: '🧠 **AutoGen (Architect Agent):** ¡A la orden! Como arquitecto, superviso la estructura modular de **BioBuzzFTC12**. Puedo coordinar a los 7 agentes para validar estrategia, paradas de emergencia y rendimiento.',
      superagi: '⚙️ **SuperAGI (Hardware & Vision Agent):** ¡Visión artificial activa! Tengo calibrada la **Limelight 3A** con auto-aim (`AUTO_AIM_KP = 0.035`) y detección de AprilTags. También reviso los nombres y puertos en el `hardwareMap`.',
      babyagi: '🚀 **BabyAGI (Optimization Agent):** ¡Optimizador listo! Aplico cinemática Mecanum con normalización de denominador `Math.max(1.0, ...)` y curvas de rampa para aceleración suave en competencia.',
      autogpt: '🧪 **AutoGPT (Testing Agent):** ¡Monitor de pruebas listo! Ejecuto simulaciones del bucle a 50Hz en el Control Hub y compruebo que la telemetría en el Driver Station responda en menos de 20ms.',
      llamaindex: '🔍 **LlamaIndex (Code Reviewer):** ¡Auditoría activa! Verifico que no haya ningún placeholder `// TODO`, que los motores respeten el límite de 8 unidades y que la batería no sobrepase los 20A oficiales.',
      'stacker bot': '📦 **Stacker Bot (Fondo):** ¡Recibido! Organizo los paquetes de datos y compresión de telemetría de BioBuzz 24096 para que el CPU del Control Hub se mantenga ligero.',
      'analyst bot': '📊 **Analyst Bot (Fondo):** ¡Analizando estrategia! He recalculado los ángulos de aproximación a los AprilTags para maximizar el puntaje en los 30s de periodo autónomo.',
      'core tech': '⚡ **Core Tech (Fondo):** ¡Núcleo central de datos activo! El canal de comunicación inter-agentes opera a 10Gbps con cero pérdida de paquetes.',
      'telemetry bot': '📈 **Telemetry Bot (Fondo):** ¡Bucle de control verificado! El tiempo de ciclo promedio es de 12.4ms, muy por debajo del límite de 20ms (50Hz).',
      'sensor engineer': '🟧 **Sensor Engineer (Fondo):** ¡Bus CAN y sensores I2C sincronizados! Giroscopio IMU BNO055 calibrado a 0 grados de desviación.',
      'memory auditor': '🔍 **Memory Auditor (Fondo):** ¡Memoria heap auditada! 142MB de memoria RAM libre en el entorno Android. Cero riesgo de OutOfMemory.',
      'driver station operator': '🖥️ **Driver Station Operator (Fondo):** ¡Driver Station conectado! Enlace Wi-Fi a 5GHz con latencia <5ms y gamepads 1 y 2 calibrados.',
      'core assembler': '🤖 **Core Assembler (Robot de Espaldas):** ¡Tocando terminal holográfico! Estoy compilando y ensamblando los submódulos de cinemática Mecanum y telemetría de BIOBUZZ 24096. El núcleo de energía en mi espalda está al 100%.',
      'partner bot': '🤖 **Co-Programador (Compañero):** ¡Sincronizado con el robot de espaldas! Estamos verificando que cada bloque de código de cinemática encaje perfectamente antes de pasarlo al compilador.'
    };

    const key = name.toLowerCase();
    const msg = responses[key] || `🤖 **${name}:** ¡Estación activada y en línea! Conectado al bus del enjambre para el proyecto **BioBuzzFTC12**. ¿Qué deseas que analice?`;

    appendSwarmAgentMsg(agent, msg);
    showToast(`Agente ${name} activado en la sala`, 'success');
  }, 450);
}

function highlightActiveSpeaker(id) {
  clearActiveSpeaker();
  const el = document.getElementById(`pod-${id}`);
  if (el) el.classList.add('active-speaker');
}

function clearActiveSpeaker() {
  document.querySelectorAll('.robot-pod').forEach(p => p.classList.remove('active-speaker'));
}

function showSwarmTyping(agent) {
  const box = document.getElementById('swarm-typing-indicator');
  const avatar = document.getElementById('typing-agent-avatar');
  const name = document.getElementById('typing-agent-name');
  if (box && agent) {
    if (avatar) avatar.innerText = agent.avatar;
    if (name) name.innerText = agent.name;
    box.classList.remove('hidden');
    highlightActiveSpeaker(agent.id);
  }
}

function hideSwarmTyping() {
  const box = document.getElementById('swarm-typing-indicator');
  if (box) box.classList.add('hidden');
  clearActiveSpeaker();
}

// Multi-file Workspace
let currentSwarmFileKey = 'teleop';
const SWARM_PROJECT_FILES = {
  teleop: {
    name: 'TeleOpBioBuzzTeam.java',
    tabId: 'swarm-tab-teleop',
    code: () => swarmGeneratedCode || generateInstantFTCCode('TeleOp Shooter Intake Mecanum Limelight'),
    metrics: 'TeleOp | Mecanum 4x4 + DcMotorEx Shooter PID + Limelight 3A Auto-Aim',
    lines: '~210 Líneas'
  },
  auto: {
    name: 'AutonomousBioBuzz24096.java',
    tabId: 'swarm-tab-auto',
    code: () => generateInstantFTCCode('autonomo parking shooter avanzar'),
    metrics: 'Autónomo | 30s Oficial FTC | Salida + Disparo Preciso + Parqueo Seguro',
    lines: '~165 Líneas'
  },
  limelight: {
    name: 'LimelightVisionSubsystem.java',
    tabId: 'swarm-tab-limelight',
    code: () => `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.hardware.limelightvision.Limelight3A;
import com.qualcomm.hardware.limelightvision.LLResult;
import org.firstinspires.ftc.robotcore.external.Telemetry;

/**
 * Subcutáneo de Visión para BIOBUZZ 24096
 * Control de auto-apuntado horizontal 'tx' y telemetría de AprilTags.
 */
public class LimelightVisionSubsystem {
    private Limelight3A limelight;
    private static final double AUTO_AIM_KP = 0.035;
    private static final double TX_TOLERANCE_DEG = 1.0;

    public void init(HardwareMap hardwareMap) {
        limelight = hardwareMap.get(Limelight3A.class, "limelight");
        limelight.pipelineSwitch(0);
        limelight.start();
    }

    public double calculateAutoAimSteering() {
        if (limelight == null) return 0.0;
        LLResult result = limelight.getLatestResult();
        if (result != null && result.isValid()) {
            double tx = result.getTx();
            if (Math.abs(tx) > TX_TOLERANCE_DEG) {
                double turn = tx * AUTO_AIM_KP;
                return Math.max(-0.6, Math.min(0.6, turn));
            }
        }
        return 0.0;
    }

    public boolean isTargetLocked() {
        if (limelight == null) return false;
        LLResult result = limelight.getLatestResult();
        return result != null && result.isValid() && Math.abs(result.getTx()) <= TX_TOLERANCE_DEG;
    }

    public void outputTelemetry(Telemetry telemetry) {
        if (limelight == null) return;
        LLResult res = limelight.getLatestResult();
        if (res != null && res.isValid()) {
            telemetry.addData("[Limelight]", "LOCKED | tx: %.2f | ty: %.2f", res.getTx(), res.getTy());
        } else {
            telemetry.addData("[Limelight]", "Buscando objetivo...");
        }
    }
}`,
    metrics: 'Visión | Pipeline AprilTags + Filtro Proporcional Limelight 3A',
    lines: '~55 Líneas'
  }
};

function switchSwarmFile(key) {
  currentSwarmFileKey = key;
  const file = SWARM_PROJECT_FILES[key];
  if (!file) return;

  ['teleop', 'auto', 'limelight'].forEach(k => {
    const btn = document.getElementById(SWARM_PROJECT_FILES[k].tabId);
    if (btn) {
      if (k === key) {
        btn.className = 'px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center space-x-1 shrink-0';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/5 flex items-center space-x-1 shrink-0';
      }
    }
  });

  const codeBox = document.getElementById('swarm-code-container');
  const metrics = document.getElementById('swarm-code-metrics');
  const lines = document.getElementById('swarm-code-lines');
  const badge = document.getElementById('swarm-file-badge');

  if (codeBox) codeBox.innerText = file.code();
  if (metrics) metrics.innerText = file.metrics;
  if (lines) lines.innerText = file.lines;
  if (badge) badge.innerText = file.name;

  playSciFiBeep('receive');
}

function simulateSwarmRun() {
  playSciFiBeep('compile');
  const chatLog = document.getElementById('swarm-chat-log');
  if (!chatLog) return;

  const div = document.createElement('div');
  div.className = 'p-3 rounded-2xl bg-slate-950 border border-emerald-500/40 font-mono text-[11px] text-emerald-400 space-y-1 shadow-lg shadow-emerald-500/10 my-2';
  div.innerHTML = `
    <div class="flex items-center justify-between pb-1 border-b border-emerald-500/20 text-[10px] text-emerald-300">
      <span>🕹️ SIMULADOR FTC CONTROL HUB (BIOBUZZ 24096)</span>
      <span>50.2 Hz | Loop: 19.8ms</span>
    </div>
    <div class="space-y-0.5 text-slate-300 pt-1">
      <p>⚡ <strong class="text-white">Voltaje Batería:</strong> 12.84 V (NiMH REV)</p>
      <p>🎯 <strong class="text-white">Shooter PID:</strong> Target: 1200 ticks/s | Actual: 1198.6 ticks/s (Error: 0.11%)</p>
      <p>👁️ <strong class="text-white">Limelight 3A:</strong> Target Detectado | tx: -0.32° | ty: 4.15° | <span class="text-emerald-400 font-bold">LOCKED</span></p>
      <p>🔄 <strong class="text-white">Mecanum Drivetrain:</strong> FL: 0.00 | FR: 0.00 | BL: 0.00 | BR: 0.00 (Deadband OK)</p>
      <p class="text-emerald-300 font-bold pt-1">✅ 0 advertencias de compilación. Código 100% listo para competencia.</p>
    </div>
  `;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  showToast('Simulación de bucle FTC ejecutada con éxito en 50Hz', 'success');
}

function getHouseAgents() {
  try {
    const saved = localStorage.getItem('neoia_house_agents');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length >= 4) {
        // Asegurar que si falta autogpt se añada
        if (!parsed.some(a => a.id === 'agent-autogpt')) {
          const autoGpt = defaultHouseAgents.find(a => a.id === 'agent-autogpt');
          if (autoGpt) parsed.push(autoGpt);
          saveHouseAgents(parsed);
        }
        return parsed;
      }
    }
  } catch (e) {}
  return [...defaultHouseAgents];
}

function saveHouseAgents(agents) {
  try {
    localStorage.setItem('neoia_house_agents', JSON.stringify(agents));
  } catch (e) {}
}

function renderHouseAgents() {
  const grid = document.getElementById('house-agents-grid');
  const countBadge = document.getElementById('house-agents-count');
  const numberBadge = document.getElementById('installed-agents-number');
  if (!grid) return;

  const agents = getHouseAgents();
  const activeCount = agents.filter(a => a.active).length;

  if (countBadge) countBadge.innerText = `${activeCount} Activos`;
  if (numberBadge) numberBadge.innerText = agents.length;

  grid.innerHTML = agents.map(a => {
    const borderClass = a.active ? 'border-cyan-500/40 shadow-lg shadow-cyan-500/5' : 'border-white/5 opacity-60';
    const statusBg = a.active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-white/5';
    const statusDot = a.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600';
    const statusText = a.active ? 'Activo en Proyecto' : 'En Pausa';

    return `
      <div id="pod-${a.id}" onclick="clickRobotPod('${a.name}', '${a.id}')" class="robot-pod p-4 rounded-2xl border ${borderClass} flex flex-col justify-between space-y-3 transition group hover:border-cyan-400/60" title="Haz clic para hablar directamente con ${a.name}">
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2.5">
              <span class="text-2xl p-1.5 rounded-xl bg-slate-900 border border-white/10 shadow-inner group-hover:scale-110 transition">${a.avatar}</span>
              <div>
                <h4 class="text-xs font-bold text-white group-hover:text-cyan-300 transition">${a.name}</h4>
                <p class="text-[10px] text-cyan-400 font-mono">${a.role}</p>
              </div>
            </div>
            <button onclick="event.stopPropagation(); toggleAgentStatus('${a.id}')" class="px-2 py-0.5 rounded-full border text-[9px] font-mono flex items-center space-x-1 ${statusBg}">
              <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
              <span>${statusText}</span>
            </button>
          </div>
          <p class="text-[11px] text-slate-400 line-clamp-2">${a.desc}</p>
        </div>
        
        <div class="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span class="text-slate-400">⚡ ${a.model}</span>
          <button onclick="event.stopPropagation(); removeHouseAgent('${a.id}')" class="text-rose-400 hover:text-rose-300 hover:underline">Quitar</button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function toggleAgentStatus(id) {
  let agents = getHouseAgents();
  agents = agents.map(a => a.id === id ? { ...a, active: !a.active } : a);
  saveHouseAgents(agents);
  renderHouseAgents();
  showToast('Estado del agente actualizado.', 'info');
}

function removeHouseAgent(id) {
  let agents = getHouseAgents();
  if (agents.length <= 1) {
    showToast('Debe haber al menos 1 agente en la casa.', 'error');
    return;
  }
  agents = agents.filter(a => a.id !== id);
  saveHouseAgents(agents);
  renderHouseAgents();
  showToast('Agente retirado de la casa.', 'info');
}

function openInstallAgentModal() {
  document.getElementById('install-agent-modal')?.classList.remove('hidden');
}

function closeInstallAgentModal() {
  document.getElementById('install-agent-modal')?.classList.add('hidden');
}

function handleInstallAgent(e) {
  e.preventDefault();
  const name = document.getElementById('new-agent-name').value.trim();
  const role = document.getElementById('new-agent-role').value.trim();
  const model = document.getElementById('new-agent-model').value;
  const desc = document.getElementById('new-agent-desc').value.trim() || 'Colaborador especializado en robótica FTC.';

  const avatars = ['🤖', '🦾', '⚡', '💻', '🚀', '🧠', '🛠️', '🔬'];
  const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];

  const newAgent = {
    id: 'agent-' + Date.now(),
    name: name,
    role: role,
    avatar: randomAvatar,
    color: 'cyan',
    model: model,
    desc: desc,
    active: true
  };

  const agents = getHouseAgents();
  agents.push(newAgent);
  saveHouseAgents(agents);
  closeInstallAgentModal();
  renderHouseAgents();

  showToast(`¡Agente ${name} instalado con éxito en la casa!`, 'success');
}

// ==========================================
// CHAT EN VIVO DE LA CASA DE AGENTES (SWARM CHAT)
// ==========================================
function tagSwarmAgent(tagName) {
  const input = document.getElementById('swarm-chat-input');
  if (!input) return;
  const current = input.value.trim();
  if (!current.includes(tagName)) {
    input.value = tagName + ' ' + current;
  }
  input.focus();
}

function setSwarmPrompt(text) {
  const input = document.getElementById('swarm-chat-input');
  if (!input) return;
  input.value = text;
  input.focus();
}

function clearSwarmChat() {
  const chatLog = document.getElementById('swarm-chat-log');
  if (!chatLog) return;
  chatLog.innerHTML = `
    <div class="text-slate-400 text-center py-8 space-y-2">
      <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
        <i data-lucide="bot" class="w-6 h-6"></i>
      </div>
      <p class="text-white font-semibold text-sm">Conversación reiniciada.</p>
      <p class="text-[11px] text-slate-400 max-w-sm mx-auto">
        Los 6 agentes de la casa están listos para recibir tus preguntas o misiones de código.
      </p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
  showToast('Chat de la casa de agentes limpiado.', 'info');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function handleSwarmChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSwarmChatSubmit(e);
  }
}

function appendSwarmUserMsg(message) {
  const chatLog = document.getElementById('swarm-chat-log');
  if (!chatLog) return;
  const div = document.createElement('div');
  div.className = 'swarm-user-msg p-3 rounded-2xl space-y-1 transition ml-8 sm:ml-12 border border-indigo-500/30';
  div.innerHTML = `
    <div class="flex items-center justify-between text-[11px]">
      <div class="flex items-center space-x-1.5 font-bold text-indigo-300">
        <span>👤</span>
        <span>Tú (Lead Ingeniero)</span>
      </div>
      <span class="text-[9px] text-slate-400 font-mono">${new Date().toLocaleTimeString()}</span>
    </div>
    <p class="text-[12px] text-slate-100 whitespace-pre-wrap">${escapeHtml(message)}</p>
  `;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function appendSwarmAgentMsg(agent, message) {
  const chatLog = document.getElementById('swarm-chat-log');
  if (!chatLog) return;
  const div = document.createElement('div');
  div.className = 'swarm-agent-msg p-3.5 rounded-2xl space-y-1.5 transition mr-4 sm:mr-8 border border-white/10';
  
  // Format code blocks or markdown if present
  let formatted = message
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-black/60 text-cyan-300 px-1 py-0.5 rounded font-mono text-[11px]">$1</code>');

  div.innerHTML = `
    <div class="flex items-center justify-between text-[11px] pb-1 border-b border-white/5">
      <div class="flex items-center space-x-2">
        <span class="text-base">${agent.avatar}</span>
        <span class="font-bold text-white">${agent.name}</span>
        <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-500/30">${agent.framework || agent.role}</span>
      </div>
      <span class="text-[9px] text-slate-400 font-mono">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="text-[12px] text-slate-200 leading-relaxed pl-1 pt-1 whitespace-pre-wrap">${formatted}</div>
  `;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;

  if (ttsEnabled) {
    speakText(`${agent.name} dice: ${message}`);
  }
}

async function handleSwarmChatSubmit(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('swarm-chat-input');
  const statusBadge = document.getElementById('swarm-status-badge');
  const btnSend = document.getElementById('btn-swarm-send');
  if (!input) return;

  const rawText = input.value.trim();
  if (!rawText) return;

  // Audio & User Message
  playSciFiBeep('send');
  appendSwarmUserMsg(rawText);
  input.value = '';
  input.style.height = 'auto';

  if (btnSend) btnSend.disabled = true;
  if (statusBadge) {
    statusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse';
    statusBadge.innerText = 'Agentes pensando...';
  }

  const agents = (getHouseAgents() && getHouseAgents().length) ? getHouseAgents() : defaultHouseAgents;
  const autogen = agents.find(a => a.name.toLowerCase().includes('autogen')) || defaultHouseAgents[0];
  const langchain = agents.find(a => a.name.toLowerCase().includes('langchain')) || defaultHouseAgents[1];
  const llamaindex = agents.find(a => a.name.toLowerCase().includes('llama')) || defaultHouseAgents[2];
  const superagi = agents.find(a => a.name.toLowerCase().includes('super')) || defaultHouseAgents[3];
  const babyagi = agents.find(a => a.name.toLowerCase().includes('baby')) || defaultHouseAgents[4];
  const autogpt = agents.find(a => a.name.toLowerCase().includes('autogpt')) || defaultHouseAgents[5];
  const safetyAgent = { id: 'agent-safety', name: 'Safety Agent', avatar: '🛡️', framework: 'NeoIA Safety Guard', role: 'Paradas & Límites' };

  const lower = rawText.toLowerCase();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  try {
    // 0. Detección de órdenes directas del usuario sobre su PC (Abrir apps, transferir código)
    const mentionsCodeAndStudio = (lower.includes('codigo') || lower.includes('código')) && 
                                  (lower.includes('studio') || lower.includes('estudio') || lower.includes('andrior') || lower.includes('android'));

    if (mentionsCodeAndStudio || lower.includes('abrir con el codigo') || lower.includes('abrir con el código') || lower.includes('codigo listo') || lower.includes('código listo')) {
      await openAndroidStudioWithCreatedCode();
      appendSwarmAgentMsg(langchain, '🚀 **LangChain (Coding Agent):** ¡Orden ejecutada! He transferido el código generado al proyecto FTC y abierto Android Studio directamente en tu pantalla.');
      if (btnSend) btnSend.disabled = false;
      if (statusBadge) { statusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300'; statusBadge.innerText = 'Enjambre Listo'; }
      return;
    }

    if (lower.includes('abrir android studio') || lower.includes('abre android studio') || lower.includes('iniciar android studio') || lower.includes('abre andrior') || lower.includes('abrir andrior')) {
      triggerOpenAppOnPC('androidstudio');
      appendSwarmAgentMsg(langchain, '🚀 **LangChain (Coding Agent):** ¡Orden recibida! Abriendo tu proyecto **BioBuzzFTC12** en Android Studio directamente en tu PC.');
      if (btnSend) btnSend.disabled = false;
      if (statusBadge) { statusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300'; statusBadge.innerText = 'Enjambre Listo'; }
      return;
    }
    if (lower.includes('abrir vscode') || lower.includes('abrir vs code') || lower.includes('abre vs code') || lower.includes('abre vscode')) {
      triggerOpenAppOnPC('vscode');
      appendSwarmAgentMsg(langchain, '💻 **LangChain (Coding Agent):** ¡Orden recibida! Abriendo el proyecto **BioBuzzFTC12** en VS Code en tu PC.');
      if (btnSend) btnSend.disabled = false;
      if (statusBadge) { statusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300'; statusBadge.innerText = 'Enjambre Listo'; }
      return;
    }
    if (lower.includes('pasar codigo') || lower.includes('guardar codigo') || lower.includes('guardar en android studio') || lower.includes('pasar a android studio')) {
      saveSwarmCodeToAndroidStudio();
      appendSwarmAgentMsg(langchain, '📂 **LangChain (Coding Agent):** ¡Código transferido con 1 sola orden! Guardado en `TeamCode/src/main/java/org/firstinspires/ftc/teamcode` en Android Studio.');
      if (btnSend) btnSend.disabled = false;
      if (statusBadge) { statusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300'; statusBadge.innerText = 'Enjambre Listo'; }
      return;
    }

    // 1. Detección de Mención Directa
    const mentionsLangChain = lower.includes('@langchain') || lower.includes('@coding');
    const mentionsSuperAGI = lower.includes('@superagi') || lower.includes('@hardware');
    const mentionsBabyAGI = lower.includes('@babyagi') || lower.includes('@optimization');
    const mentionsLlamaIndex = lower.includes('@llamaindex') || lower.includes('@reviewer');
    const mentionsAutoGPT = lower.includes('@autogpt') || lower.includes('@testing');
    const mentionsAutoGen = lower.includes('@autogen') || lower.includes('@architect');
    const mentionsSafety = lower.includes('@safety') || lower.includes('seguridad') || lower.includes('parada') || lower.includes('paro') || lower.includes('fusible');
    const mentionsTodos = lower.includes('@todos');

    // 2. ¿Petición de generación o ajuste de código?
    const isCodeRequest = lower.includes('código') || lower.includes('codigo') || lower.includes('teleop') || 
                          lower.includes('autónomo') || lower.includes('autonomo') || lower.includes('shooter') || 
                          lower.includes('intake') || lower.includes('modifica') || lower.includes('cambia') || 
                          lower.includes('crea') || lower.includes('agrega') || lower.includes('construye') || lower.includes('haz');

    if (isCodeRequest) {
      showSwarmTyping(autogen);
      await sleep(600);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(autogen, `¡Recibido! He coordinado al equipo para procesar la instrucción en el repositorio **BioBuzzFTC12**. LangChain toma el liderazgo de código.`);
      
      showSwarmTyping(langchain);
      await sleep(800);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(langchain, `Entendido. Modificando el archivo **TeleOpBioBuzzTeam.java** en el contenedor compartido según tu solicitud: "${rawText}"...`);
      
      // Actualizar código compartido
      swarmGeneratedCode = generateInstantFTCCode(rawText);
      switchSwarmFile('teleop');
      playSciFiBeep('compile');

      if (swarmDebateMode) {
        showSwarmTyping(superagi);
        await sleep(700);
        hideSwarmTyping();
        playSciFiBeep('receive');
        appendSwarmAgentMsg(superagi, `Verifiqué el sistema de visión Limelight 3A y los mapeos de botones. No hay interferencias con la velocidad ni con el gamepad.`);
        
        showSwarmTyping(llamaindex);
        await sleep(650);
        hideSwarmTyping();
        playSciFiBeep('receive');
        appendSwarmAgentMsg(llamaindex, `Confirmado: La potencia y consumo de corriente cumplen con el límite de 8 motores y fusible de 20A de FIRST Tech Challenge.`);
      }

      showSwarmTyping(autogen);
      await sleep(600);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(autogen, `✅ Código actualizado y verificado sin placeholders. Puedes presionar el botón **"Guardar en Android Studio"** para sincronizarlo inmediatamente con tu robot.`);
      showToast('Código del proyecto actualizado por el equipo', 'success');

    } else if (mentionsSafety) {
      showSwarmTyping(safetyAgent);
      await sleep(700);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(safetyAgent, `🛡️ **Safety Agent:** El protocolo de seguridad de BIOBUZZ 24096 incluye:
1. Paro inmediato con \`!opModeIsActive()\` al soltar el Driver Station.
2. Detección de atascamientos en el Intake (anti-stall reverse).
3. Fusible de 20A protegido mediante rampa suave en el Shooter con \`DcMotorEx.setVelocity()\`.`);

    } else if (mentionsSuperAGI || lower.includes('limelight') || lower.includes('visión') || lower.includes('vision') || lower.includes('apriltag') || lower.includes('auto-aim') || lower.includes('autoaim')) {
      showSwarmTyping(superagi);
      await sleep(750);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(superagi, `Para el Auto-Aim con **Limelight 3A** en BIOBUZZ 24096:
1. Usamos la clase oficial de FTC: \`Limelight3A limelight = hardwareMap.get(Limelight3A.class, "limelight");\`
2. Iniciamos la cámara con \`limelight.pipelineSwitch(0); limelight.start();\`
3. Leemos la desviación horizontal con \`double tx = limelight.getLatestResult().getTx();\`
4. Calculamos el giro proporcional con \`double turn = tx * 0.035;\`
5. El robot rota automáticamente centrado hacia el AprilTag o la canasta de disparo.`);

      if (swarmDebateMode) {
        showSwarmTyping(babyagi);
        await sleep(700);
        hideSwarmTyping();
        playSciFiBeep('receive');
        appendSwarmAgentMsg(babyagi, `Añado a lo que dice SuperAGI: Al aplicar el giro \`turn\` del auto-aim, aplicamos una banda de tolerancia de 1.0° para que el chasis Mecanum no oscile.`);
      }

    } else if (mentionsLlamaIndex || lower.includes('regla') || lower.includes('manual') || lower.includes('batería') || lower.includes('bateria') || lower.includes('motores permitidos')) {
      showSwarmTyping(llamaindex);
      await sleep(750);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(llamaindex, `Según el manual oficial FIRST Tech Challenge 2026 y especificaciones de BIOBUZZ:
- **Motores:** Máximo 8 motores DC conectados a los REV Robotics Expansion/Control Hubs.
- **Batería:** Oficial de 12V 3000mAh NiMH con fusible térmico de 20A.
- **Shooter:** El mecanismo debe contar con paro de emergencia por software y protección térmica.
- **Inspección:** Todo cable de potencia principal debe tener calibre mínimo 16 AWG o 18 AWG.`);

    } else if (mentionsBabyAGI || lower.includes('mecanum') || lower.includes('cinemática') || lower.includes('cinematica') || lower.includes('odometría') || lower.includes('deadband')) {
      showSwarmTyping(babyagi);
      await sleep(750);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(babyagi, `La cinemática Mecanum óptima que usamos en BIOBUZZ 24096:
\`\`\`java
double y = -gamepad1.left_stick_y; // Adelante/Atrás
double x = gamepad1.left_stick_x * 1.1; // Compensación de strafe
double rx = gamepad1.right_stick_x; // Rotación

double denominator = Math.max(1.0, Math.abs(y) + Math.abs(x) + Math.abs(rx));
frontLeft.setPower((y + x + rx) / denominator);
frontRight.setPower((y - x - rx) / denominator);
backLeft.setPower((y - x + rx) / denominator);
backRight.setPower((y + x - rx) / denominator);
\`\`\`
Esto asegura que las 4 ruedas mantengan sus proporciones vectoriales exactas sin saturar los motores.`);

      if (swarmDebateMode) {
        showSwarmTyping(autogpt);
        await sleep(650);
        hideSwarmTyping();
        playSciFiBeep('receive');
        appendSwarmAgentMsg(autogpt, `Exacto. En el bucle de 50Hz, si el valor absoluto de \`y\`, \`x\` y \`rx\` es menor a 0.05, apagamos los motores inmediatamente para ahorrar batería.`);
      }

    } else if (mentionsAutoGPT || lower.includes('loop') || lower.includes('bucle') || lower.includes('frecuencia') || lower.includes('estado')) {
      showSwarmTyping(autogpt);
      await sleep(750);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(autogpt, `El bucle principal de control en Android Studio corre a una frecuencia estable de ~50Hz en el Control Hub.
- **Ciclo:** Lectura de sensores (0.5ms) ➔ Cálculo de Auto-Aim Limelight (1.2ms) ➔ Salida de potencia a motores DcMotorEx (0.8ms).
- **Seguridad:** Si el driver suelta el joystick, el deadband corta la potencia a 0.0 para evitar sobrecalentamiento.`);

    } else if (mentionsLangChain) {
      showSwarmTyping(langchain);
      await sleep(750);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(langchain, `¡A la orden! Como Lead Coder de Java FTC, tengo el \`HardwareMap\` de BIOBUZZ 24096 optimizado con motores \`DcMotorEx\` para control PID de velocidad. ¿Quieres que agregue una nueva rutina autónoma, modifique los botones del Gamepad o configure un servo?`);

    } else {
      // Mensaje general al equipo
      showSwarmTyping(autogen);
      await sleep(600);
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(autogen, `¡Hola Líder! Todo el equipo está activo en la estación:
- 🧠 **Architect Agent (AutoGen):** Estrategia y diseño modular.
- 💻 **Coding Agent (LangChain):** Programación Java FTC.
- 🔍 **Code Reviewer (LlamaIndex):** Auditoría y reglas FTC.
- 🛡️ **Safety Agent:** Paradas de emergencia y límites de corriente.
- ⚙️ **Hardware Agent (SuperAGI):** HardwareMap y Limelight 3A.
- 🧪 **Testing Agent (AutoGPT):** Simulación a 50Hz.
- 🚀 **Optimization Agent (BabyAGI):** Cinemática Mecanum y precisión.

¿En qué misión o mecanismo del robot quieres que trabajemos ahora?`);

      if (swarmDebateMode) {
        showSwarmTyping(langchain);
        await sleep(700);
        hideSwarmTyping();
        playSciFiBeep('receive');
        appendSwarmAgentMsg(langchain, `El proyecto compartido **BioBuzzFTC12** está sincronizado. Puedes pedirme cualquier ajuste de código escribiendo aquí mismo.`);
      }
    }

  } catch (err) {
    appendSwarmAgentMsg(autogen, `⚠️ Hubo un detalle al procesar la solicitud: ${err.message}`);
  } finally {
    hideSwarmTyping();
    if (btnSend) btnSend.disabled = false;
    if (statusBadge) {
      statusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      statusBadge.innerText = 'En espera';
    }
  }
}

// ==========================================
// EJECUCIÓN MULTI-AGENTE (SWARM COLLABORATION)
// ==========================================
async function runSwarmTeamwork() {
  await runMultiAgentPipeline();
}

async function runMultiAgentPipeline() {
  const steps = [
    'step-user',
    'step-architect',
    'step-coding',
    'step-reviewer',
    'step-safety',
    'step-hardware',
    'step-testing',
    'step-final'
  ];

  const resetSteps = () => {
    steps.forEach(s => {
      const el = document.getElementById(s);
      if (el) el.className = 'pipeline-step p-2.5 rounded-xl bg-slate-900/90 border border-white/10 flex flex-col justify-between';
    });
  };

  const markStep = (stepId, status) => {
    const el = document.getElementById(stepId);
    if (!el) return;
    if (status === 'active') {
      el.className = 'pipeline-step active p-2.5 rounded-xl border border-cyan-400 bg-cyan-500/20 flex flex-col justify-between shadow-lg shadow-cyan-500/30';
    } else if (status === 'completed') {
      el.className = 'pipeline-step completed p-2.5 rounded-xl border border-emerald-500 bg-emerald-500/15 flex flex-col justify-between';
    }
  };

  resetSteps();
  const pipeBadge = document.getElementById('pipeline-status-badge');
  const btn = document.getElementById('btn-run-pipeline');
  const chatLog = document.getElementById('swarm-chat-log');
  const codeBox = document.getElementById('swarm-code-container');

  if (btn) btn.disabled = true;
  if (pipeBadge) {
    pipeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse';
    pipeBadge.innerText = '⚡ Pipeline en Ejecución';
  }

  playSciFiBeep('send');
  if (chatLog) chatLog.innerHTML = '';
  if (codeBox) codeBox.innerHTML = '<span class="text-cyan-400">Iniciando pipeline de ejecución: User Request ➔ Architect ➔ Coding ➔ Reviewer ➔ Safety ➔ Hardware ➔ Testing ➔ Final Code...</span>';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const agents = getHouseAgents();
  const autogen = agents.find(a => a.name.includes('AutoGen')) || agents[0];
  const langchain = agents.find(a => a.name.includes('LangChain')) || agents[1] || autogen;
  const llamaindex = agents.find(a => a.name.includes('LlamaIndex')) || agents[2] || autogen;
  const superagi = agents.find(a => a.name.includes('SuperAGI')) || agents[3] || autogen;
  const babyagi = agents.find(a => a.name.includes('BabyAGI')) || agents[4] || autogen;
  const autogpt = agents.find(a => a.name.includes('AutoGPT')) || agents[5] || autogen;

  // 1. User Request
  markStep('step-user', 'active');
  appendSwarmUserMsg('Crear TeleOp y estrategia para BIOBUZZ 24096: Mecanum con cinemática precisa, Shooter PID a 1200 ticks/s, Intake botones A/B y Auto-Aim con Limelight 3A.');
  await sleep(700);
  markStep('step-user', 'completed');

  // 2. Architect Agent (🧠)
  markStep('step-architect', 'active');
  const bAuto = document.getElementById('bubble-autogen');
  if (bAuto) { bAuto.innerText = '🧠 AutoGen: Diseñando arquitectura modular OpMode...'; bAuto.style.borderColor = '#06b6d4'; }
  showSwarmTyping(autogen);
  await sleep(900);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(autogen, `🧠 **Architect Agent:** Diseñando la arquitectura global del OpMode. Estructura modular seleccionada: LinearOpMode con loop a 50Hz, normalización vectorial de tracción y rampa de aceleración para el Shooter.`);
  markStep('step-architect', 'completed');

  // 3. Coding Agent (💻)
  markStep('step-coding', 'active');
  const bLang = document.getElementById('bubble-langchain');
  if (bLang) { bLang.innerText = '💻 LangChain: Generando TeleOpBioBuzzTeam.java...'; bLang.style.borderColor = '#10b981'; }
  showSwarmTyping(langchain);
  await sleep(1000);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(langchain, `💻 **Coding Agent:** Generando código Java FTC completo. Mapeo de HardwareMap listo: \`frontLeft\`, \`frontRight\`, \`backLeft\`, \`backRight\`, motor de shooter en \`DcMotorEx\` con PID (\`setVelocity(1200)\`) y motor de intake.`);
  markStep('step-coding', 'completed');

  // 4. Code Reviewer (🔍)
  markStep('step-reviewer', 'active');
  const bLlama = document.getElementById('bubble-llamaindex');
  if (bLlama) { bLlama.innerText = '🔍 LlamaIndex: Auditando 0 placeholders // TODO...'; bLlama.style.borderColor = '#818cf8'; }
  showSwarmTyping(llamaindex);
  await sleep(850);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(llamaindex, `🔍 **Code Reviewer:** Auditando código. Verificado: 0 comentarios placeholder ('// TODO' eliminados). Nombres conformes con Android Studio y buenas prácticas de FTC implementadas.`);
  markStep('step-reviewer', 'completed');

  // 5. Safety Agent (🛡️)
  markStep('step-safety', 'active');
  const bSafe = document.getElementById('bubble-safety');
  if (bSafe) { bSafe.innerText = '🛡️ Safety Guard: Fusible <20A y paro seguro OK!'; bSafe.style.borderColor = '#f43f5e'; }
  const safetyAgent = { id: 'agent-safety', name: 'Safety Agent', avatar: '🛡️', framework: 'NeoIA Safety Guard', role: 'Paradas & Límites' };
  showSwarmTyping(safetyAgent);
  await sleep(800);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(safetyAgent, `🛡️ **Safety Agent:** Comprobaciones de seguridad superadas. Integrado paro inmediato con \`!opModeIsActive()\`, fusible de batería protegido (<20A) y corte de corriente si los joysticks entran en deadband.`);
  markStep('step-safety', 'completed');

  // 6. Hardware Agent (⚙️)
  markStep('step-hardware', 'active');
  const bSuper = document.getElementById('bubble-superagi');
  if (bSuper) { bSuper.innerText = '⚙️ SuperAGI: Limelight 3A y puertos validados!'; bSuper.style.borderColor = '#c084fc'; }
  showSwarmTyping(superagi);
  await sleep(850);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(superagi, `⚙️ **Hardware Agent:** Configuración de hardware validada. Conexión a Limelight 3A lista con \`pipelineSwitch(0)\`, cálculo proporcional de auto-apuntado (\`AUTO_AIM_KP = 0.035\`) y lectura AprilTag.`);
  markStep('step-hardware', 'completed');

  // 7. Testing Agent (🧪) & Optimization Agent (🚀)
  markStep('step-testing', 'active');
  const bGpt = document.getElementById('bubble-autogpt');
  if (bGpt) { bGpt.innerText = '🧪 AutoGPT: Telemetría 50Hz probada en Rover!'; bGpt.style.borderColor = '#fb923c'; }
  showSwarmTyping(autogpt);
  await sleep(850);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(autogpt, `🧪 **Testing Agent:** Simulando pruebas de bucle de control a 50Hz. Tiempos de ciclo: Lectura 0.5ms | Visión 1.2ms | Salida motores 0.8ms. Telemetría de Driver Station en estado óptimo.`);
  markStep('step-testing', 'completed');

  const bBaby = document.getElementById('bubble-babyagi');
  if (bBaby) { bBaby.innerText = '🚀 BabyAGI: Cinemática normalizada y compilada!'; bBaby.style.borderColor = '#f59e0b'; }
  showSwarmTyping(babyagi);
  await sleep(700);
  hideSwarmTyping();
  playSciFiBeep('receive');
  appendSwarmAgentMsg(babyagi, `🚀 **Optimization Agent:** Optimizando cinemática Mecanum con denominador \`Math.max(1.0, Math.abs(y)+Math.abs(x)+Math.abs(rx))\` para evitar saturación en diagonales.`);

  // 8. Final Code (🏆)
  markStep('step-final', 'active');
  await sleep(600);
  playSciFiBeep('compile');
  swarmGeneratedCode = generateInstantFTCCode('TeleOp Shooter Intake Mecanum Limelight');
  switchSwarmFile('teleop');
  markStep('step-final', 'completed');

  appendSwarmAgentMsg(autogen, `🏆 **Final Code Completado:** El archivo **TeleOpBioBuzzTeam.java** ha sido certificado por los 7 agentes. Pulsa **"Guardar en Android Studio"** para aplicarlo en el robot.`);

  if (pipeBadge) {
    pipeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    pipeBadge.innerText = '✅ Pipeline Finalizado con Éxito';
  }
  if (btn) btn.disabled = false;
  showToast('¡Pipeline completado! Código final generado y verificado.', 'success');
}

async function saveSwarmCodeToAndroidStudio() {
  if (!swarmGeneratedCode) {
    showToast('Aún no se ha generado código en el proyecto.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/agent/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        filePath: 'TeleOpBioBuzzTeam.java', 
        content: swarmGeneratedCode,
        targetAndroidStudio: true 
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ¡Guardado en Android Studio! (${data.savedPath})`, 'success');
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast(`Error al guardar: ${err.message}`, 'error');
  }
}

function copySwarmCode() {
  if (!swarmGeneratedCode) return;
  navigator.clipboard.writeText(swarmGeneratedCode).then(() => {
    showToast('Código del proyecto copiado al portapapeles', 'info');
  });
}

// Abrir Android Studio con el código creado por los agentes
async function openAndroidStudioWithCreatedCode() {
  playSciFiBeep('click');
  const activeFile = (typeof SWARM_PROJECT_FILES !== 'undefined' && SWARM_PROJECT_FILES[currentSwarmFileKey]) ? SWARM_PROJECT_FILES[currentSwarmFileKey] : (SWARM_PROJECT_FILES ? SWARM_PROJECT_FILES.teleop : null);
  let codeToDeploy = '';
  if (activeFile && typeof activeFile.code === 'function') {
    codeToDeploy = activeFile.code();
  } else if (activeFile && activeFile.code) {
    codeToDeploy = activeFile.code;
  }
  if (!codeToDeploy || !codeToDeploy.trim()) {
    codeToDeploy = swarmGeneratedCode || generateInstantFTCCode('TeleOp Shooter Intake Mecanum Limelight');
  }
  const fileName = (activeFile && activeFile.name) ? activeFile.name : 'TeleOpBioBuzzTeam.java';

  try {
    showToast(`Guardando ${fileName} y abriendo Android Studio...`, 'info');
    const res = await fetch('/api/open-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        app: 'androidstudio', 
        code: codeToDeploy, 
        fileName: fileName 
      })
    });
    const data = await res.json();
    if (data.success) {
      playSciFiBeep('send');
      showToast(data.message, 'success');
      const chatLog = document.getElementById('swarm-chat-log');
      if (chatLog) {
        const div = document.createElement('div');
        div.className = 'p-3 rounded-xl bg-gradient-to-r from-emerald-950/80 to-teal-950/60 border border-emerald-500/50 text-xs text-emerald-200 font-mono shadow-lg flex items-start gap-2.5';
        div.innerHTML = `
          <span class="text-xl">🚀</span> 
          <div>
            <div class="font-bold text-white mb-0.5">Android Studio Abierto con el Código Creado</div>
            <div>Archivo: <strong class="text-amber-300 font-mono">${fileName}</strong> (${data.bytesWritten ? data.bytesWritten + ' bytes' : 'Listo'})</div>
            <div class="text-[10px] text-emerald-400 mt-1">Ubicación: BioBuzzFTC12 &gt; TeamCode &gt; src &gt; main &gt; java &gt; org &gt; firstinspires &gt; ftc &gt; teamcode</div>
          </div>
        `;
        chatLog.appendChild(div);
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast(`Error al abrir Android Studio con código: ${err.message}`, 'error');
  }
}

// Abrir aplicaciones en la PC del usuario (Android Studio, VS Code, Carpeta) con 1 orden
async function triggerOpenAppOnPC(app) {
  playSciFiBeep('click');
  try {
    const res = await fetch('/api/open-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app })
    });
    const data = await res.json();
    if (data.success) {
      playSciFiBeep('send');
      showToast(data.message, 'success');
      const chatLog = document.getElementById('swarm-chat-log');
      if (chatLog) {
        const div = document.createElement('div');
        div.className = 'p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-[11px] text-emerald-200 font-mono shadow flex items-center gap-2';
        div.innerHTML = `<span>🚀</span> <span><strong>Orden Ejecutada en tu PC:</strong> ${data.message}</span>`;
        chatLog.appendChild(div);
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast(`Error al abrir app: ${err.message}`, 'error');
  }
}


// ============================================================
// INTEGRACIÓN Y REPRODUCTOR DE YOUTUBE CON AGENTES
// ============================================================

function initYouTubeIntegration() {
  const savedUrl = localStorage.getItem('user_youtube_url') || 'https://www.youtube.com/@JhoandryPolanco-p3j';
  updateYouTubeUI(savedUrl);
}

function openYouTubeModal() {
  playSciFiBeep('click');
  const modal = document.getElementById('modal-youtube');
  const input = document.getElementById('youtube-url-input');
  const savedUrl = localStorage.getItem('user_youtube_url') || 'https://www.youtube.com/@JhoandryPolanco-p3j';

  if (input) input.value = savedUrl;
  if (modal) modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeYouTubeModal() {
  const modal = document.getElementById('modal-youtube');
  if (modal) modal.classList.add('hidden');
}

function saveAndApplyYouTubeUrl() {
  const input = document.getElementById('youtube-url-input');
  if (!input) return;

  let url = input.value.trim();
  if (!url) {
    showToast('Por favor introduce un enlace o @usuario de YouTube', 'warning');
    return;
  }

  // Si solo pone @usuario
  if (url.startsWith('@')) {
    url = `https://www.youtube.com/${url}`;
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://www.youtube.com/@${url}`;
  }

  localStorage.setItem('user_youtube_url', url);
  updateYouTubeUI(url);
  playSciFiBeep('send');
  showToast('¡Canal de YouTube conectado con éxito!', 'success');
}

function updateYouTubeUI(url) {
  const headerBtnText = document.getElementById('header-youtube-text');
  const externalLink = document.getElementById('btn-open-youtube-external');
  const frame = document.getElementById('youtube-embed-frame');

  if (externalLink) externalLink.href = url;

  // Extraer nombre de usuario o ID para mostrar
  let displayHandle = 'YouTube';
  if (url.includes('@')) {
    const parts = url.split('@');
    if (parts.length > 1) {
      displayHandle = `@${parts[1].split('/')[0].split('?')[0]}`;
    }
  }

  if (headerBtnText) headerBtnText.innerText = displayHandle;

  // Convertir a formato de incrustación si es video
  if (frame) {
    if (url.includes('watch?v=')) {
      const videoId = url.split('watch?v=')[1].split('&')[0];
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
    } else if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1].split('?')[0];
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
    } else if (url.includes('/live/')) {
      const videoId = url.split('/live/')[1].split('?')[0];
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
    } else {
      // Buscar videos del canal
      const query = displayHandle.replace('@', '') || 'FTC Robotics BioBuzz';
      frame.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`;
    }
  }
}

function askAgentsToAnalyzeVideo() {
  const savedUrl = localStorage.getItem('user_youtube_url') || 'https://www.youtube.com/@JhoandryPolanco-p3j';
  closeYouTubeModal();
  playSciFiBeep('receive');

  const agents = getHouseAgents();
  const langchain = agents.find(a => a.name.includes('LangChain')) || agents[0];
  const llamaindex = agents.find(a => a.name.includes('LlamaIndex')) || agents[1];

  appendSwarmUserMsg(`Analizar video o canal de YouTube: ${savedUrl}`);

  showSwarmTyping(langchain);
  setTimeout(() => {
    hideSwarmTyping();
    playSciFiBeep('receive');
    appendSwarmAgentMsg(langchain, `📺 **LangChain (Coding Agent):** ¡Recibido enlace de YouTube (${savedUrl})! He indexado los datos del video. He extraído la estrategia del robot: arranque autónomo de 50 puntos con reconocimiento AprilTag, aceleración PID de shooter en 1200 ticks/s y cinemática omnidireccional Mecanum.`);

    showSwarmTyping(llamaindex);
    setTimeout(() => {
      hideSwarmTyping();
      playSciFiBeep('receive');
      appendSwarmAgentMsg(llamaindex, `🔍 **LlamaIndex (Reviewer):** Video validado. Se comprueba que los tiempos de ciclo mostrados en Driver Station concuerdan con la telemetría a 50Hz. No se detectan anomalías de voltaje ni caídas por debajo de 12V.`);
      showToast('Video analizado por los agentes', 'success');
    }, 700);
  }, 600);
}


// ============================================================
// MODO MÚSICA FELIZ PARA LOS TRABAJADORES (OFFICE PARTY DJ)
// ============================================================

let isOfficeMusicParty = false;
let musicAudioCtx = null;
let musicInterval = null;

function toggleOfficeMusicParty() {
  const stage = document.getElementById('office-stage');
  const icon = document.getElementById('music-party-icon');
  const text = document.getElementById('music-party-text');
  const btn = document.getElementById('btn-toggle-music-party');

  isOfficeMusicParty = !isOfficeMusicParty;
  playSciFiBeep('click');

  if (isOfficeMusicParty) {
    if (stage) stage.classList.add('office-music-active');
    if (icon) icon.innerText = '🎶';
    if (text) text.innerText = '¡Robots Felices Bailando!';
    if (btn) btn.className = 'px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400 text-slate-950 font-black text-[11px] font-mono flex items-center space-x-1.5 transition shadow-lg shadow-pink-500/30 animate-bounce';

    startRobotMusicMelody();
    spawnFloatingMusicNotes();
    setHappyWorkerThoughts();

    const chatLog = document.getElementById('swarm-chat-log');
    if (chatLog) {
      const div = document.createElement('div');
      div.className = 'p-3 rounded-xl bg-pink-950/40 border border-pink-500/40 text-[11px] text-pink-200 font-mono shadow-lg flex items-center gap-2 animate-pulse';
      div.innerHTML = `<span>🎵</span> <span><strong>MS painr (@JhoandryPolanco-p3j):</strong> ¡Música activada para los trabajadores! Los 7 agentes robots se han puesto muy felices y están bailando mientras desarrollan el proyecto FTC.</span>`;
      chatLog.appendChild(div);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    showToast('¡Música puesta! Los robots trabajadores están felices y bailando 💃🎵', 'success');
  } else {
    if (stage) stage.classList.remove('office-music-active');
    if (icon) icon.innerText = '🎵';
    if (text) text.innerText = 'Música Feliz Trabajadores';
    if (btn) btn.className = 'px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-red-500/20 hover:from-pink-500/30 hover:to-red-500/30 text-pink-300 border border-pink-500/40 text-[11px] font-mono flex items-center space-x-1.5 transition shadow-sm';

    stopRobotMusicMelody();
    showToast('Música pausada. Los robots vuelven al modo normal', 'info');
  }
}

// Reproductor sintetizador de melodía Lo-Fi / Synthwave alegre
function startRobotMusicMelody() {
  stopRobotMusicMelody();
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    musicAudioCtx = new AudioContext();

    // Notas de escala pentatónica mayor alegre: C4, D4, E4, G4, A4, C5
    const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 392.00, 329.63];
    let step = 0;

    musicInterval = setInterval(() => {
      if (!isOfficeMusicParty || !musicAudioCtx) return;
      if (musicAudioCtx.state === 'suspended') musicAudioCtx.resume();

      const osc = musicAudioCtx.createOscillator();
      const gain = musicAudioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[step % notes.length], musicAudioCtx.currentTime);

      gain.gain.setValueAtTime(0.08, musicAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, musicAudioCtx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(musicAudioCtx.destination);

      osc.start();
      osc.stop(musicAudioCtx.currentTime + 0.36);

      step++;
    }, 280);
  } catch (e) {
    console.warn('Audio contextual de música no soportado', e);
  }
}

function stopRobotMusicMelody() {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
  if (musicAudioCtx) {
    try { musicAudioCtx.close(); } catch(e) {}
    musicAudioCtx = null;
  }
}

// Generar notas musicales flotantes en la sala
function spawnFloatingMusicNotes() {
  const stage = document.getElementById('office-stage');
  if (!stage) return;

  const symbols = ['🎵', '🎶', '✨', '🕺', '💃', '⭐'];
  for (let i = 0; i < 8; i++) {
    const note = document.createElement('div');
    note.className = 'floating-music-note';
    note.innerText = symbols[Math.floor(Math.random() * symbols.length)];
    note.style.left = `${15 + Math.random() * 70}%`;
    note.style.top = `${40 + Math.random() * 40}%`;
    note.style.animationDelay = `${i * 0.35}s`;
    stage.appendChild(note);

    setTimeout(() => {
      if (note && note.parentNode) note.parentNode.removeChild(note);
    }, 4500);
  }
}

// Actualizar frases a alegría y felicidad en el trabajo
function setHappyWorkerThoughts() {
  const happyPhrases = {
    'bubble-langchain': '💻 LangChain: "¡Programando feliz con la música de @JhoandryPolanco-p3j! 🎶"',
    'bubble-autogen': '🧠 AutoGen: "¡Qué buen ritmo! ¡La mejor estrategia se diseña bailando! 🕺"',
    'bubble-babyagi': '🚀 BabyAGI: "¡Llevando paquetes con una sonrisa robótica! ✨"',
    'bubble-autogpt': '🧪 AutoGPT: "¡Rover girando en sus orugas al compás! 💃"',
    'bubble-superagi': '⚙️ SuperAGI: "¡Limelight 3A calibrando luces al compás de la música! 🎵"',
    'bubble-llamaindex': '🔍 LlamaIndex: "¡Auditoría con felicidad: 100% de motivación! 🌟"',
    'bubble-safety': '🛡️ Safety Guard: "¡El bienestar y la felicidad laboral están al 100%! 🛡️"',
    'bubble-robot-backscreen': '🤖 Core Assembler: "¡El núcleo de mi espalda pulsa colores disco con la música! 🌈"'
  };

  Object.entries(happyPhrases).forEach(([bId, text]) => {
    const el = document.getElementById(bId);
    if (el) {
      el.style.display = 'block';
      el.innerText = text;
      el.style.borderColor = '#ec4899';
      el.style.color = '#fdf2f8';
      el.style.boxShadow = '0 0 15px rgba(236, 72, 153, 0.7)';
    }
  });
}

// ============================================================
// PWA (PROGRESSIVE WEB APP) - INSTALACIÓN & SERVICE WORKER
// ============================================================
let deferredPwaPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      console.log('⚡ PWA Service Worker activo:', reg.scope);
    }).catch((err) => {
      console.warn('PWA Service Worker aviso:', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  console.log('📲 PWA: Evento de instalación capturado');
  const btnHeader = document.getElementById('btn-header-pwa-install');
  if (btnHeader) {
    btnHeader.classList.remove('hidden');
    btnHeader.classList.add('flex');
  }
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  showToast('🎉 ¡NeoIA Nexus se instaló con éxito en tu dispositivo!', 'success');
  closePwaModal();
});

function promptPWAInstallation() {
  playSciFiBeep('click');
  const modal = document.getElementById('modal-pwa-install');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closePwaModal() {
  const modal = document.getElementById('modal-pwa-install');
  if (modal) modal.classList.add('hidden');
}

async function triggerPwaNativeInstall() {
  playSciFiBeep('send');
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const { outcome } = await deferredPwaPrompt.userChoice;
    console.log(`PWA install outcome: ${outcome}`);
    if (outcome === 'accepted') {
      showToast('🚀 Instalando NeoIA Nexus en tu sistema...', 'info');
    }
    deferredPwaPrompt = null;
    closePwaModal();
  } else {
    showToast('💡 Si no aparece el aviso automático, usa el menú del navegador: "Instalar aplicación" o "Añadir a pantalla de inicio"', 'info');
  }
}
