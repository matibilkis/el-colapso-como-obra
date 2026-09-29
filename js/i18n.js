// Spanish / English strings. DOM nodes opt in with data-i18n (innerHTML), data-i18n-title, data-i18n-aria.
const STR = {
  es: {
    'doc.title': 'El colapso como obra',
    'doc.desc': 'Una esfera de Bloch para tocar, cantar y escuchar: superposición, medición y decoherencia. Rucha Benare y Matías Bilkis.',
    'brand.title': 'El colapso <em>como obra</em>',
    'brand.sub': 'una esfera de Bloch para tocar, cantar y escuchar',
    'stage.aria': 'Esfera de Bloch interactiva',
    'nav.aria': 'Sensores y opciones',
    'chip.cam': 'manos', 'chip.cam.title': 'cámara: las manos manipulan (C)',
    'chip.mic': 'voz', 'chip.mic.title': 'micrófono: la voz es el Hamiltoniano, el aplauso mide (V)',
    'chip.sound': 'sonido', 'chip.sound.title': 'sonido (S)',
    'chip.theme.title': 'día / noche (T)', 'chip.theme.aria': 'día o noche',
    'chip.qr.title': 'abrir en el celular (Q)', 'chip.qr.aria': 'código QR',
    'chip.info.title': '¿qué estoy viendo? (?)', 'chip.info.aria': 'información',
    'chip.lang.title': 'English (L)', 'chip.lang': 'EN',
    'card.state': 'estado',
    'p.zero': '0 · grave', 'p.one': 'agudo · 1',
    'pov.from': 'desde el punto de vista',
    'meter.coh': 'coherencia', 'meter.pur': 'pureza',
    'card.prep': 'preparar',
    'energy': 'energía <small>(giro del Hamiltoniano)</small>',
    'card.meas': 'medir', 'axes.label': 'punto de vista',
    'play.title': 'tiros automáticos (P)',
    'tempo': 'ritmo <b id="tempoTxt">4</b> tiros/s',
    'count.zeros': 'ceros', 'count.ones': 'unos', 'count.shots': 'tiros',
    'note': 'barra: frecuencias en los últimos 64 tiros · marca blanca: regla de Born',
    'mode.manip': '<b>Manipular</b><small>superposición</small>',
    'mode.measure': '<b>Medir</b><small>colapso</small>',
    'look': 'mirar', 'look.shot': 'un tiro', 'look.title': 'mirar (espacio)',
    'z.quantum': 'dominio cuántico', 'z.classical': 'dominio clásico', 'z.size': 'tamaño (# de átomos)',
    'z.aria': 'tamaño del sistema en número de átomos',
    'size.one': '1 átomo', 'size.many': 'átomos',
    'sizes': ['un átomo', 'una molécula', 'una proteína', 'un virus', 'una bacteria', 'una mota de polvo', 'un gato · nosotros'],
    'intro.kicker': 'Quantum &amp; Arts · un diálogo',
    'intro.title': 'El colapso<br><em>como obra</em>',
    'intro.lede': 'Una esfera de Bloch para tocar, cantar y escuchar.<br>Superposición, medición y decoherencia, con las manos, la voz y el oído.',
    'intro.all': 'entrar con cámara y micrófono', 'intro.touch': 'entrar solo con el tacto',
    'intro.fine': 'Mejor con parlantes o auriculares. La cámara y el micrófono se procesan en tu dispositivo; nada se envía.',
    'close': 'cerrar',
    'info.title': '¿Qué estoy viendo?',
    'info.p1': '<b>La esfera de Bloch.</b> Cada punto es un estado posible de un qubit, <span class="m">|ψ⟩ = cos(θ/2)|0⟩ + e<sup>iφ</sup> sin(θ/2)|1⟩</span>. El polo norte es <span class="m">|0⟩</span> (punto negro, grave); el sur, <span class="m">|1⟩</span> (punto rojo, agudo). Todo lo demás es superposición.',
    'info.p2': '<b>Manipular.</b> Rotar el estado es aplicar compuertas. La superposición suena como un acorde: el grave y el agudo a la vez, cada uno con el peso de su amplitud. La nota del medio (fa♯) es la coherencia, la parte genuinamente cuántica; se ve como el resplandor claro alrededor del trazo rojo, que es el estado. Tu voz es el Hamiltoniano: el volumen empuja el estado entre 0 y 1 (oscilaciones de Rabi) y la altura fija la frecuencia con la que gira (energía = frecuencia).',
    'info.p3': '<b>Medir.</b> Mirar es elegir un punto de vista, un eje, y hacerle una pregunta al qubit: la respuesta es 0 o 1, al azar, y el estado colapsa. Cada respuesta cae como un punto en la fila de abajo, negro si es 0, rojo si es 1. Preparando y midiendo muchas veces, las frecuencias se acercan a la regla de Born. Cambiar el punto de vista cambia la realidad que escuchás.',
    'info.p4': '<b>El entorno.</b> Los puntos que flotan son el entorno. Cuanto más grande el sistema, más rápido se enredan con el qubit (los hilos) y guardan registros de lo que "ven": la coherencia se apaga, el azul se vuelve gris y el acorde queda vacío. Así emerge lo clásico: nadie necesita mirar, el mundo ya miró. Medida en z, una mezcla suena igual que una superposición; en x, no.',
    'info.fine': 'Simulación de un qubit en el navegador (vector de Bloch con desfase en la base z). El azar viene del generador criptográfico del navegador, no de un qubit real, y la escala de tamaños es ilustrativa. Detector de manos: MediaPipe, local.',
    'info.keysTitle': 'Atajos',
    'info.keys': '<kbd>espacio</kbd> mirar · <kbd>M</kbd> modo · <kbd>0</kbd> <kbd>1</kbd> <kbd>+</kbd> <kbd>−</kbd> <kbd>i</kbd> preparar · <kbd>Z</kbd> <kbd>X</kbd> <kbd>Y</kbd> punto de vista · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> rotar · <kbd>P</kbd> tiros · <kbd>[</kbd> <kbd>]</kbd> tamaño · <kbd>C</kbd> manos · <kbd>V</kbd> voz · <kbd>S</kbd> sonido · <kbd>T</kbd> noche · <kbd>L</kbd> English · <kbd>Q</kbd> QR · <kbd>F</kbd> pantalla completa · <kbd>H</kbd> ocultar interfaz',
    'info.credits': 'A partir de «Quantum &amp; Arts: a dialogue», de Rucha Benare y Matías Bilkis. Homenaje a <i>Bleu II</i> de Joan Miró y a «The Border Territory», de W. H. Zurek (<i>Physics Today</i>, 1991).',
    'qr.title': 'Abrilo en tu celular',
    'ket.pure': 'estado puro',
    'ket.mixed': 'mezcla clásica: el entorno ya "sabe"',
    'ket.purity': 'pureza',
    'ket.partial': 'parcialmente coherente: el entorno está mirando',
    'axis': a => `eje ${a}`, 'axis.free': 'eje libre',
    'toast.hands': 'despertando el detector de manos…',
    'toast.camOn': 'mostrá la mano · pellizcá para agarrar',
    'toast.camErr': 'no pude abrir la cámara',
    'toast.micOn': 'cantá · o aplaudí para mirar',
    'toast.micErr': 'no pude abrir el micrófono',
    'scene.pov': 'punto de vista', 'scene.collapse': 'colapso',
    hints: {
      manip: [
        ['', 'Arrastrá la esfera como un globo para rotar el estado · doble toque o espacio para mirar'],
        ['cam', 'Pellizcá en el aire (pulgar + índice) y mové la mano: el qubit te sigue'],
        ['mic', 'Cantá: el volumen empuja el estado entre 0 y 1; la altura de tu voz lo hace girar · un aplauso lo mide'],
        ['', 'El trazo rojo es el estado. La superposición suena como acorde: grave (0) y agudo (1) a la vez'],
        ['', 'Subí el tamaño: el entorno se enreda con el qubit, apaga la coherencia y el azul se vuelve gris'],
      ],
      measure: [
        ['', 'Preparar y medir, una y otra vez: punto negro = 0 (grave) · punto rojo = 1 (agudo)'],
        ['', 'Más ceros → más grave · más unos → más agudo · las frecuencias tienden a la regla de Born'],
        ['', 'Cambiá el punto de vista (z · x · y, o arrastrando): el mismo estado da otras respuestas'],
        ['', 'Probá |+⟩: medido en z es azar puro; medido en x da siempre 0'],
        ['', 'Con decoherencia, |+⟩ en x deja de dar siempre 0: el entorno ya lo miró'],
        ['cam', 'Pellizcá y mové la mano para girar el ojo (el punto de vista)'],
      ],
    },
  },
  en: {
    'doc.title': 'Collapse as Artwork',
    'doc.desc': 'A Bloch sphere to touch, sing and listen to: superposition, measurement and decoherence. Rucha Benare and Matías Bilkis.',
    'brand.title': 'Collapse <em>as artwork</em>',
    'brand.sub': 'a Bloch sphere to touch, sing and listen to',
    'stage.aria': 'Interactive Bloch sphere',
    'nav.aria': 'Sensors and options',
    'chip.cam': 'hands', 'chip.cam.title': 'camera: your hands manipulate (C)',
    'chip.mic': 'voice', 'chip.mic.title': 'microphone: your voice is the Hamiltonian, a clap measures (V)',
    'chip.sound': 'sound', 'chip.sound.title': 'sound (S)',
    'chip.theme.title': 'day / night (T)', 'chip.theme.aria': 'day or night',
    'chip.qr.title': 'open on your phone (Q)', 'chip.qr.aria': 'QR code',
    'chip.info.title': 'what am I looking at? (?)', 'chip.info.aria': 'information',
    'chip.lang.title': 'Español (L)', 'chip.lang': 'ES',
    'card.state': 'state',
    'p.zero': '0 · low', 'p.one': 'high · 1',
    'pov.from': 'from the point of view',
    'meter.coh': 'coherence', 'meter.pur': 'purity',
    'card.prep': 'prepare',
    'energy': 'energy <small>(Hamiltonian spin)</small>',
    'card.meas': 'measure', 'axes.label': 'point of view',
    'play.title': 'automatic shots (P)',
    'tempo': 'rate <b id="tempoTxt">4</b> shots/s',
    'count.zeros': 'zeros', 'count.ones': 'ones', 'count.shots': 'shots',
    'note': 'bar: frequencies over the last 64 shots · white mark: Born rule',
    'mode.manip': '<b>Manipulate</b><small>superposition</small>',
    'mode.measure': '<b>Measure</b><small>collapse</small>',
    'look': 'look', 'look.shot': 'one shot', 'look.title': 'look (space)',
    'z.quantum': 'quantum domain', 'z.classical': 'classical domain', 'z.size': 'size (# of atoms)',
    'z.aria': 'system size in number of atoms',
    'size.one': '1 atom', 'size.many': 'atoms',
    'sizes': ['an atom', 'a molecule', 'a protein', 'a virus', 'a bacterium', 'a speck of dust', 'a cat · us'],
    'intro.kicker': 'Quantum &amp; Arts · a dialogue',
    'intro.title': 'Collapse<br><em>as artwork</em>',
    'intro.lede': 'A Bloch sphere to touch, sing and listen to.<br>Superposition, measurement and decoherence, with your hands, your voice and your ears.',
    'intro.all': 'enter with camera and microphone', 'intro.touch': 'enter with touch only',
    'intro.fine': 'Best with speakers or headphones. Camera and microphone are processed on your device; nothing is sent.',
    'close': 'close',
    'info.title': 'What am I looking at?',
    'info.p1': '<b>The Bloch sphere.</b> Every point is a possible state of a qubit, <span class="m">|ψ⟩ = cos(θ/2)|0⟩ + e<sup>iφ</sup> sin(θ/2)|1⟩</span>. The north pole is <span class="m">|0⟩</span> (black dot, low); the south pole, <span class="m">|1⟩</span> (red dot, high). Everything else is superposition.',
    'info.p2': '<b>Manipulate.</b> Rotating the state means applying gates. A superposition sounds like a chord: low and high at once, each weighted by its amplitude. The middle note (F♯) is the coherence, the genuinely quantum part; it shows as the pale glow around the red stroke, which is the state. Your voice is the Hamiltonian: loudness pushes the state between 0 and 1 (Rabi oscillations) and pitch sets how fast it spins (energy = frequency).',
    'info.p3': '<b>Measure.</b> Looking means choosing a point of view, an axis, and asking the qubit a question: the answer is 0 or 1, at random, and the state collapses. Each answer drops as a dot into the row below, black for 0, red for 1. Preparing and measuring many times, the frequencies approach the Born rule. Changing the point of view changes the reality you hear.',
    'info.p4': '<b>The environment.</b> The drifting dots are the environment. The larger the system, the faster they get entangled with the qubit (the threads) and keep records of what they "see": coherence fades, the blue turns grey and the chord goes hollow. That is how the classical world emerges: nobody needs to look, the world already did. Measured along z, a mixture sounds just like a superposition; along x, it does not.',
    'info.fine': 'A qubit simulated in the browser (Bloch vector with dephasing in the z basis). The randomness comes from the browser\'s cryptographic generator, not from a real qubit, and the size scale is illustrative. Hand tracking: MediaPipe, on device.',
    'info.keysTitle': 'Shortcuts',
    'info.keys': '<kbd>space</kbd> look · <kbd>M</kbd> mode · <kbd>0</kbd> <kbd>1</kbd> <kbd>+</kbd> <kbd>−</kbd> <kbd>i</kbd> prepare · <kbd>Z</kbd> <kbd>X</kbd> <kbd>Y</kbd> point of view · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> rotate · <kbd>P</kbd> shots · <kbd>[</kbd> <kbd>]</kbd> size · <kbd>C</kbd> hands · <kbd>V</kbd> voice · <kbd>S</kbd> sound · <kbd>T</kbd> night · <kbd>L</kbd> español · <kbd>Q</kbd> QR · <kbd>F</kbd> fullscreen · <kbd>H</kbd> hide interface',
    'info.credits': 'Based on «Quantum &amp; Arts: a dialogue», by Rucha Benare and Matías Bilkis. A homage to Joan Miró\'s <i>Bleu II</i> and to W. H. Zurek\'s «The Border Territory» (<i>Physics Today</i>, 1991).',
    'qr.title': 'Open it on your phone',
    'ket.pure': 'pure state',
    'ket.mixed': 'classical mixture: the environment already "knows"',
    'ket.purity': 'purity',
    'ket.partial': 'partly coherent: the environment is watching',
    'axis': a => `${a} axis`, 'axis.free': 'free axis',
    'toast.hands': 'waking up the hand tracker…',
    'toast.camOn': 'show your hand · pinch to grab',
    'toast.camErr': 'could not open the camera',
    'toast.micOn': 'sing · or clap to look',
    'toast.micErr': 'could not open the microphone',
    'scene.pov': 'point of view', 'scene.collapse': 'collapse',
    hints: {
      manip: [
        ['', 'Drag the sphere like a globe to rotate the state · double tap or space to look'],
        ['cam', 'Pinch in the air (thumb + index) and move your hand: the qubit follows you'],
        ['mic', 'Sing: loudness pushes the state between 0 and 1; your pitch makes it spin · a clap measures it'],
        ['', 'The red stroke is the state. A superposition sounds like a chord: low (0) and high (1) at once'],
        ['', 'Raise the size: the environment gets entangled with the qubit, coherence fades and the blue turns grey'],
      ],
      measure: [
        ['', 'Prepare and measure, again and again: black dot = 0 (low) · red dot = 1 (high)'],
        ['', 'More zeros → lower · more ones → higher · the frequencies tend to the Born rule'],
        ['', 'Change the point of view (z · x · y, or by dragging): the same state gives other answers'],
        ['', 'Try |+⟩: measured along z it is pure chance; along x it always gives 0'],
        ['', 'With decoherence, |+⟩ along x no longer always gives 0: the environment has already looked'],
        ['cam', 'Pinch and move your hand to turn the eye (the point of view)'],
      ],
    },
  },
};

function detect() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'es' || q === 'en') return q;
  try { const s = localStorage.getItem('bloch-lang'); if (s === 'es' || s === 'en') return s; } catch { /* private mode */ }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export let lang = detect();
export const t = key => STR[lang][key] ?? STR.es[key];

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('bloch-lang', l); } catch { /* ignore */ }
  applyDom();
}

export function applyDom() {
  const d = document;
  d.documentElement.lang = lang;
  d.title = t('doc.title');
  d.querySelector('meta[name="description"]').content = t('doc.desc');
  d.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  d.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  d.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
