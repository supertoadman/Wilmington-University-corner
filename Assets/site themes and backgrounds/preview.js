const themes = window.SANCTUM_THEMES.themes;
const descriptions = {
  'divine-sanctuary': 'Ivory temples, gilded stone, and a world suspended in morning light.',
  'corrupt-sanctuary': 'Fallen guardians watch over fractured temples and an ember-lit sea of clouds.',
  'divine-archive': 'Celestial instruments and luminous marble frame an endless sky of possibility.',
  'corrupt-archive': 'Broken celestial rings turn above a forbidden archive beneath a burning eclipse.',
  'divine-grove': 'Silver-green leaves, sacred springs, and quiet gardens above the clouds.',
  'corrupt-grove': 'Thorned branches and blighted marble linger beneath a spectral evening sky.'
};
const $ = id => document.getElementById(id);
let current;
function select(id) {
  current = themes.find(t => t.id === id);
  document.body.dataset.siteTheme = id;
  $('theme-name').textContent = current.name;
  $('description').textContent = descriptions[id];
  $('realm').textContent = `${current.realm} / ${current.pair}`.toUpperCase();
  $('dimensions').textContent = `${current.width} × ${current.height} · WebP ${Math.round(current.bytes / 1024)} KB`;
  $('art-link').href = './' + current.src;
  $('original-link').href = './' + current.original;
  $('counterpart').textContent = `Explore the ${current.realm === 'divine' ? 'corrupted' : 'divine'} counterpart ↔`;
  document.querySelectorAll('.theme').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('palette').replaceChildren();
  for (const [name, hex] of Object.entries(current.palette)) {
    const swatch = document.createElement('div'); swatch.className = 'swatch';
    const chip = document.createElement('i'); chip.style.background = hex;
    const label = document.createElement('span'); label.textContent = name;
    const code = document.createElement('code'); code.textContent = hex;
    label.append(code); swatch.append(chip, label); $('palette').append(swatch);
  }
}
for (const pair of ['sanctuary', 'archive', 'grove']) for (const t of themes.filter(t => t.pair === pair)) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'theme'; button.dataset.id = t.id;
  const img = document.createElement('img'); img.src = './' + t.src; img.alt = ''; img.width = t.width; img.height = t.height;
  const title = document.createElement('strong'); title.textContent = t.name;
  const realm = document.createElement('small'); realm.textContent = t.realm.toUpperCase();
  button.append(img, title, realm); button.addEventListener('click', () => select(t.id)); $('themes').append(button);
}
$('counterpart').addEventListener('click', () => select(current.counterpart));
$('art-toggle').addEventListener('click', () => {
  const artOnly = document.body.classList.toggle('art-only');
  $('art-toggle').setAttribute('aria-pressed', String(artOnly));
  $('sample').setAttribute('aria-hidden', String(artOnly));
  $('art-toggle').textContent = artOnly ? 'Show sample content' : 'View artwork only';
});
select('divine-sanctuary');
