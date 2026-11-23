import type { Gradient } from '../gradient/gradient.js';
import type { CatalogSeed } from './seed.js';

type Shape = Pick<Gradient, 'type' | 'angle' | 'center'>;
type Copy = readonly [title: string, summary: string];
type GradientSeed = Extract<CatalogSeed, { kind: 'gradient' }>;

const linear = (angle: number): Shape => ({ type: 'linear', angle });
const radial = (x: number, y: number): Shape => ({ type: 'radial', center: [x, y] });
const conic = (angle: number, center: Gradient['center'] = [0.5, 0.5]): Shape => ({ type: 'conic', angle, center });

function gradient(id: number, slug: string, shape: Shape, colors: readonly string[],
  [en, fr, es, pt, de]: readonly [Copy, Copy, Copy, Copy, Copy], positions?: readonly number[]): GradientSeed {
  const translation = ([title, summary]: Copy) => ({ title, summary });
  return {
    itemId: '4e69a174-a608-4954-94c6-' + String(id).padStart(12, '0'), kind: 'gradient', slug, revision: 1, featuredRank: id,
    ...shape, stops: colors.map((hex, index) => ({ hex, position: positions?.[index] ?? index / (colors.length - 1) })), attribution: 'Color Kitchen',
    translations: { en: translation(en), fr: translation(fr), es: translation(es), pt: translation(pt), de: translation(de) },
  };
}

export const baseGradients: readonly GradientSeed[] = [
  gradient(1, 'peach-to-mulberry', linear(125), ['#FBC49B', '#D56C83', '#60283F'], [
    ['Peach to Mulberry', 'A warm peach highlight fades through rose into deep mulberry.'],
    ['De la pêche à la mûre', 'Une pêche lumineuse passe par le rose jusqu’à la mûre foncée.'],
    ['De melocotón a mora', 'Un melocotón cálido pasa por rosa hasta llegar a mora oscura.'],
    ['Do pêssego à amora', 'Um tom quente de pêssego passa pelo rosa e chega à amora escura.'],
    ['Von Pfirsich zu Maulbeere', 'Warmes Pfirsich geht über Rosa in dunkle Maulbeere über.'],
  ], [0, 0.42, 1]),
  gradient(2, 'mint-center', radial(0.4, 0.38), ['#E1F8D8', '#85CEAE', '#20635E'], [
    ['Mint Center', 'A pale mint glow spreads out to a dark teal edge.'],
    ['Cœur de menthe', 'Une lueur menthe claire s’étend jusqu’à un bord bleu canard foncé.'],
    ['Centro de menta', 'Un centro de menta clara se extiende hasta un borde verde azulado oscuro.'],
    ['Centro de menta', 'Um brilho de menta clara vai até à borda verde-azulada escura.'],
    ['Minzgrüner Mittelpunkt', 'Helles Minzgrün breitet sich bis zu einem dunklen Petrolrand aus.'],
  ], [0, 0.52, 1]),
  gradient(3, 'coral-and-amber-wheel', conic(35), ['#CB4748', '#F67D5E', '#F5BC58', '#F08E68', '#CB4748'], [
    ['Coral and Amber Wheel', 'Coral and amber circle back to red in a continuous loop.'],
    ['Roue corail et ambre', 'Le corail et l’ambre reviennent au rouge dans une boucle continue.'],
    ['Rueda coral y ámbar', 'El coral y el ámbar vuelven al rojo en un ciclo continuo.'],
    ['Roda coral e âmbar', 'O coral e o âmbar voltam ao vermelho num ciclo contínuo.'],
    ['Rad aus Koralle und Bernstein', 'Koralle und Bernstein gehen im Kreis wieder in Rot über.'],
  ]),
  gradient(4, 'slate-to-glacier', linear(140), ['#263F56', '#5288A4', '#93C5DA', '#E0F4FA'], [
    ['Slate to Glacier', 'Deep blue slate lightens into glacial blue and icy white.'],
    ['De l’ardoise au glacier', 'Le bleu ardoise s’éclaircit en bleu glacier puis en blanc glacé.'],
    ['De pizarra a glaciar', 'El azul pizarra se aclara hacia azul glaciar y blanco hielo.'],
    ['Da ardósia ao glaciar', 'O azul-ardósia clareia em azul glaciar e branco-gelo.'],
    ['Von Schiefer zu Gletscherblau', 'Tiefes Schieferblau geht in Gletscherblau und Eisweiß über.'],
  ]),
  gradient(5, 'amber-lantern', radial(0.46, 0.33), ['#FFF0AB', '#E9A63C', '#A15031', '#46251E'], [
    ['Amber Lantern', 'A golden center fades outward through amber, burnt orange, and brown.'],
    ['Lanterne ambrée', 'Un centre doré s’estompe en ambre, orange brûlé et brun.'],
    ['Farol ámbar', 'Un centro dorado se difumina en ámbar, naranja tostado y marrón.'],
    ['Lanterna âmbar', 'Um centro dourado desvanece em âmbar, laranja queimado e castanho.'],
    ['Bernsteinlaterne', 'Eine goldene Mitte verblasst über Bernstein und Rostorange zu Braun.'],
  ], [0, 0.29, 0.67, 1]),
  gradient(6, 'teal-and-iris-ring', conic(120), ['#137B83', '#44B7B3', '#5178BC', '#7153A7', '#137B83'], [
    ['Teal and Iris Ring', 'Clear teal wraps through blue and iris violet.'],
    ['Anneau canard et iris', 'Le bleu canard tourne vers le bleu et le violet iris.'],
    ['Anillo de turquesa e iris', 'El turquesa gira hacia el azul y el violeta iris.'],
    ['Anel turquesa e íris', 'O turquesa dá lugar ao azul e ao violeta-íris ao longo do anel.'],
    ['Ring aus Petrol und Iris', 'Klares Petrol geht im Kreis über Blau in Irisviolett über.'],
  ]),
  gradient(7, 'oat-to-cocoa', linear(90), ['#F8EAD0', '#B99C7D', '#674537'], [
    ['Oat to Cocoa', 'Light oat beige warms through tan into cocoa brown.'],
    ['De l’avoine au cacao', 'Le beige avoine passe par le fauve jusqu’au brun cacao.'],
    ['De avena a cacao', 'El beige avena pasa por tostado hasta marrón cacao.'],
    ['Da aveia ao cacau', 'O bege-aveia passa por um tom tostado até ao castanho-cacau.'],
    ['Von Hafer zu Kakao', 'Helles Haferbeige wird über Lohbraun zu Kakaobraun.'],
  ]),
  gradient(8, 'lilac-halo', radial(0.52, 0.42), ['#F7EFFF', '#D3BEE9', '#886BBA'], [
    ['Lilac Halo', 'A near-white lilac center softens into dusty violet.'],
    ['Halo lilas', 'Un cœur lilas presque blanc se fond dans un violet poudré.'],
    ['Halo lila', 'Un centro lila casi blanco se funde en violeta apagado.'],
    ['Halo lilás', 'Um centro lilás quase branco funde-se com violeta suave.'],
    ['Fliederhalo', 'Eine fast weiße Fliedermitte geht in gedämpftes Violett über.'],
  ]),
  gradient(9, 'rose-and-plum-orbit', conic(65), ['#49243E', '#9D4671', '#E68EAA', '#B96685', '#49243E'], [
    ['Rose and Plum Orbit', 'Rose pink orbits a sweep of deep plum and mauve.'],
    ['Orbite rose et prune', 'Le rose tourne autour de la prune foncée et du mauve.'],
    ['Órbita de rosa y ciruela', 'El rosa recorre un arco de ciruela oscura y malva.'],
    ['Órbita de rosa e ameixa', 'O rosa percorre um arco de ameixa escura e malva.'],
    ['Orbit aus Rosa und Pflaume', 'Rosa umläuft einen Bogen aus dunkler Pflaume und Malve.'],
  ]),
  gradient(10, 'olive-to-lemon', linear(55), ['#435137', '#83A362', '#DFDE77', '#FFF0A6'], [
    ['Olive to Lemon', 'Dark olive lifts through leaf green into lemon yellow.'],
    ['De l’olive au citron', 'L’olive foncée passe par le vert feuille jusqu’au jaune citron.'],
    ['De oliva a limón', 'El oliva oscuro pasa por verde hoja hasta amarillo limón.'],
    ['Da oliva ao limão', 'A oliva escura passa pelo verde-folha até ao amarelo-limão.'],
    ['Von Oliv zu Zitronengelb', 'Dunkles Oliv geht über Blattgrün in Zitronengelb über.'],
  ]),
  gradient(11, 'ember-center', radial(0.58, 0.55), ['#FFBB76', '#D15E48', '#782E37', '#322032'], [
    ['Ember Center', 'An orange ember fades through brick red into an aubergine shadow.'],
    ['Cœur de braise', 'Une braise orange passe par le rouge brique jusqu’à l’aubergine sombre.'],
    ['Centro de brasa', 'Una brasa naranja pasa por rojo ladrillo hasta berenjena oscura.'],
    ['Centro de brasa', 'Uma brasa laranja passa pelo vermelho-tijolo até ao tom beringela escuro.'],
    ['Glutkern', 'Eine orange Glut verblasst über Ziegelrot zu dunkler Aubergine.'],
  ]),
  gradient(12, 'indigo-tide-wheel', conic(160), ['#1C2E6E', '#4452A0', '#457FB2', '#59AEB6', '#1C2E6E'], [
    ['Indigo Tide Wheel', 'Indigo, soft blue, and tidal turquoise make a cool loop.'],
    ['Roue de marée indigo', 'Indigo, bleu doux et turquoise marin forment une boucle froide.'],
    ['Rueda de marea índigo', 'Índigo, azul suave y turquesa marino forman un ciclo fresco.'],
    ['Roda de maré índigo', 'Índigo, azul suave e turquesa marinho formam um ciclo fresco.'],
    ['Indigoblaues Gezeitenrad', 'Indigo, sanftes Blau und Meerestürkis bilden einen kühlen Kreis.'],
  ]),
  gradient(13, 'coral-to-cobalt', linear(110), ['#F37B67', '#C46D93', '#7C63BC', '#2D51AE'], [
    ['Coral to Cobalt', 'Salmon coral shifts through mauve and violet to cobalt blue.'],
    ['Du corail au cobalt', 'Le corail saumon passe par le mauve et le violet jusqu’au cobalt.'],
    ['De coral a cobalto', 'El coral salmón pasa por malva y violeta hasta azul cobalto.'],
    ['Do coral ao cobalto', 'O coral salmão passa pelo malva e violeta até ao azul-cobalto.'],
    ['Von Koralle zu Kobalt', 'Lachskoralle geht über Malve und Violett in Kobaltblau über.'],
  ]),
  gradient(14, 'apricot-cream-glow', radial(0.34, 0.3), ['#FFF5DE', '#F4C7A5', '#CD896D'], [
    ['Apricot Cream Glow', 'A cream highlight gently fades to peach and apricot.'],
    ['Lueur crème d’abricot', 'Un reflet crème s’adoucit en pêche et abricot.'],
    ['Resplandor de crema de albaricoque', 'Un centro crema se difumina en melocotón y albaricoque.'],
    ['Brilho de creme de damasco', 'Um centro creme desvanece em pêssego e damasco.'],
    ['Aprikosencreme-Glanz', 'Eine cremefarbene Mitte verblasst zu Pfirsich und Aprikose.'],
  ]),
  gradient(15, 'copper-and-moss-loop', conic(15, [0.48, 0.55]), ['#754B38', '#BE815B', '#B7A277', '#5E7153', '#754B38'], [
    ['Copper and Moss Loop', 'Copper, sand, and moss green form a muted earth-toned circle.'],
    ['Boucle cuivre et mousse', 'Cuivre, sable et vert mousse tournent en tons terreux.'],
    ['Bucle de cobre y musgo', 'Cobre, arena y verde musgo forman un círculo de tonos terrosos.'],
    ['Ciclo de cobre e musgo', 'Cobre, areia e verde-musgo formam um círculo em tons terrosos.'],
    ['Kreis aus Kupfer und Moos', 'Kupfer, Sand und Moosgrün bilden einen Kreis in Erdtönen.'],
  ]),
  gradient(16, 'deep-plum-fade', linear(155), ['#21192D', '#53354E', '#82536B'], [
    ['Deep Plum Fade', 'Near-black purple fades into plum and dusky mauve.'],
    ['Fondu prune foncée', 'Le violet presque noir se fond dans la prune et le mauve feutré.'],
    ['Fundido de ciruela oscura', 'El violeta casi negro se funde en ciruela y malva apagado.'],
    ['Degradê de ameixa escura', 'O violeta quase preto desvanece em ameixa e malva suave.'],
    ['Dunkler Pflaumenverlauf', 'Fast schwarzes Violett verblasst zu Pflaume und mattem Malve.'],
  ]),
  gradient(17, 'sea-glass-pool', radial(0.55, 0.3), ['#D5F1E7', '#85D2C5', '#349BA6', '#205B76'], [
    ['Sea Glass Pool', 'Pale sea glass deepens toward a blue lagoon edge.'],
    ['Bassin de verre marin', 'Le verre marin clair s’assombrit vers un bord bleu lagon.'],
    ['Laguna de vidrio marino', 'El vidrio marino pálido se oscurece hacia un borde azul laguna.'],
    ['Lagoa de vidro marinho', 'O vidro marinho claro escurece até à borda azul da lagoa.'],
    ['Meerglasbecken', 'Helles Meerglas wird zum Rand hin lagunenblau.'],
  ]),
  gradient(18, 'lemon-and-leaf-wheel', conic(90), ['#729848', '#B5C55E', '#EAE079', '#9CC365', '#729848'], [
    ['Lemon and Leaf Wheel', 'Lemon yellow and leaf greens turn through fresh chartreuse.'],
    ['Roue citron et feuille', 'Jaune citron et verts feuille tournent en passant par le chartreuse.'],
    ['Rueda de limón y hojas', 'El amarillo limón y los verdes hoja giran a través del chartreuse.'],
    ['Roda de limão e folha', 'Amarelo-limão e verdes de folhas giram por um tom verde-amarelado.'],
    ['Zitronen- und Blattrad', 'Zitronengelb und Blattgrün gehen im Kreis über frisches Gelbgrün.'],
  ]),
  gradient(19, 'cloud-to-denim', linear(175), ['#EDF1F2', '#ADC0D3', '#5D7899', '#2F486B'], [
    ['Cloud to Denim', 'Cloud white falls through blue-gray into deep denim.'],
    ['Du nuage au denim', 'Le blanc nuage passe par le gris bleuté jusqu’au denim foncé.'],
    ['De nube a mezclilla', 'El blanco nube pasa por gris azulado hasta el azul vaquero oscuro.'],
    ['Da nuvem ao jeans', 'O branco-nuvem passa pelo cinza-azulado até ao azul-jeans escuro.'],
    ['Von Wolke zu Denim', 'Wolkenweiß geht über Blaugrau in tiefes Denimblau über.'],
  ]),
  gradient(20, 'soft-rose-spotlight', radial(0.45, 0.45), ['#FFF1E7', '#E8B1B9', '#BD7B91'], [
    ['Soft Rose Spotlight', 'A near-white blush opens into antique rose.'],
    ['Reflet vieux rose', 'Un rose presque blanc s’ouvre sur un vieux rose.'],
    ['Foco de rosa suave', 'Un rosa casi blanco se abre hacia el rosa antiguo.'],
    ['Foco de rosa suave', 'Um rosa quase branco abre-se para um rosa antigo.'],
    ['Sanfter Rosaschein', 'Fast weißes Rosa öffnet sich zu Altrosa.'],
  ]),
  gradient(21, 'fuchsia-and-orange-twist', conic(210), ['#A52275', '#E74A8E', '#FA7950', '#E99C43', '#A52275'], [
    ['Fuchsia and Orange Twist', 'Fuchsia and orange turn around a coral transition.'],
    ['Spirale fuchsia et orange', 'Fuchsia et orange tournent autour d’une transition corail.'],
    ['Giro fucsia y naranja', 'Fucsia y naranja giran con una transición coral.'],
    ['Giro fúcsia e laranja', 'Fúcsia e laranja giram com uma transição coral.'],
    ['Wirbel aus Fuchsie und Orange', 'Fuchsie und Orange drehen sich über einen korallenfarbenen Übergang.'],
  ]),
  gradient(22, 'bronze-to-rust', linear(115), ['#4E3729', '#A37147', '#C98254', '#943E35'], [
    ['Bronze to Rust', 'Weathered bronze and copper slide into dark rust red.'],
    ['Du bronze à la rouille', 'Bronze patiné et cuivre glissent vers un rouge rouille foncé.'],
    ['De bronce a óxido', 'Bronce envejecido y cobre se deslizan hacia un rojo óxido oscuro.'],
    ['Do bronze à ferrugem', 'Bronze envelhecido e cobre deslizam para um vermelho-ferrugem escuro.'],
    ['Von Bronze zu Rost', 'Patinierte Bronze und Kupfer gehen in dunkles Rostrot über.'],
  ], [0, 0.34, 0.62, 1]),
  gradient(23, 'slate-moonlight', radial(0.68, 0.27), ['#CADAE8', '#819BB0', '#435C73', '#202B43'], [
    ['Slate Moonlight', 'Cool moonlight falls away into slate and dark navy.'],
    ['Clair de lune ardoise', 'Le clair de lune froid s’efface dans l’ardoise et le bleu marine.'],
    ['Luz de luna sobre pizarra', 'La luz fría de luna se apaga en pizarra y azul marino oscuro.'],
    ['Luar sobre ardósia', 'O luar frio esvai-se na ardósia e no azul-marinho escuro.'],
    ['Mondlicht auf Schiefer', 'Kühles Mondlicht verblasst zu Schiefer und dunklem Marineblau.'],
  ]),
  gradient(24, 'blueberry-and-lavender-ring', conic(42), ['#323F7D', '#5772B4', '#A691CD', '#7665AE', '#323F7D'], [
    ['Blueberry and Lavender Ring', 'Blueberry blue wraps around a soft lavender arc.'],
    ['Anneau myrtille et lavande', 'Le bleu myrtille entoure un arc de lavande douce.'],
    ['Anillo de arándano y lavanda', 'El azul arándano rodea un arco de lavanda suave.'],
    ['Anel de mirtilo e lavanda', 'O azul-mirtilo envolve um arco de lavanda suave.'],
    ['Ring aus Blaubeere und Lavendel', 'Blaubeerblau umschließt einen sanften Lavendelbogen.'],
  ]),
  gradient(25, 'mint-to-pine', linear(165), ['#D5F3CE', '#87C3A3', '#437E66', '#24483D'], [
    ['Mint to Pine', 'Fresh mint deepens into fern and shaded pine green.'],
    ['De la menthe au pin', 'La menthe fraîche s’assombrit en fougère puis en vert pin ombragé.'],
    ['De menta a pino', 'La menta fresca se oscurece hacia helecho y verde pino.'],
    ['Da menta ao pinheiro', 'A menta fresca escurece em feto e verde-pinheiro sombreado.'],
    ['Von Minze zu Kiefer', 'Frische Minze wird über Farn zu schattigem Kieferngrün.'],
  ]),
  gradient(26, 'pale-sun', radial(0.41, 0.49), ['#FFF8BF', '#ECD68E'], [
    ['Pale Sun', 'Two quiet yellows form a soft, even glow.'],
    ['Soleil pâle', 'Deux jaunes doux forment une lueur uniforme.'],
    ['Sol pálido', 'Dos amarillos suaves forman un resplandor uniforme.'],
    ['Sol pálido', 'Dois amarelos suaves formam um brilho uniforme.'],
    ['Blasse Sonne', 'Zwei ruhige Gelbtöne bilden ein weiches, gleichmäßiges Leuchten.'],
  ]),
  gradient(27, 'silver-and-charcoal-sweep', conic(100), ['#3D423F', '#7B8481', '#CCD0CA', '#929A96', '#3D423F'], [
    ['Silver and Charcoal Sweep', 'A gray sweep brightens to a brushed silver highlight.'],
    ['Arc argent et charbon', 'Un arc gris s’éclaircit jusqu’à un reflet argent brossé.'],
    ['Barrido plata y carbón', 'Un arco gris se ilumina hasta un reflejo de plata cepillada.'],
    ['Arco de prata e carvão', 'Um arco cinzento clareia até um reflexo de prata escovada.'],
    ['Bogen aus Silber und Kohle', 'Ein grauer Bogen hellt sich zu gebürstetem Silber auf.'],
  ]),
  gradient(28, 'peach-to-sky', linear(95), ['#FFD8BD', '#E7CDD9', '#BEDAF1'], [
    ['Peach to Sky', 'Soft peach passes through a cool blush into pale sky blue.'],
    ['De la pêche au ciel', 'La pêche douce passe par un rose froid jusqu’au bleu ciel pâle.'],
    ['De melocotón a cielo', 'El melocotón suave pasa por rosa frío hasta azul cielo pálido.'],
    ['Do pêssego ao céu', 'O pêssego suave passa por rosa frio até ao azul-céu claro.'],
    ['Von Pfirsich zu Himmelblau', 'Sanfter Pfirsich geht über kühles Rosa in blasses Himmelblau über.'],
  ]),
  gradient(29, 'pomegranate-glow', radial(0.56, 0.4), ['#F39287', '#CB4F68', '#722C4D', '#3A2138'], [
    ['Pomegranate Glow', 'A pink-red center falls away to wine and deep plum.'],
    ['Lueur de grenade', 'Un cœur rouge rosé s’estompe vers le lie-de-vin et la prune foncée.'],
    ['Resplandor de granada', 'Un centro rojo rosado se difumina en vino y ciruela oscura.'],
    ['Brilho de romã', 'Um centro vermelho rosado desvanece em vinho e ameixa escura.'],
    ['Granatapfelglanz', 'Eine rosarote Mitte verblasst zu Weinrot und dunkler Pflaume.'],
  ]),
  gradient(30, 'tangerine-and-plum-spin', conic(225, [0.53, 0.48]), ['#502C4D', '#8F4A67', '#D96565', '#F6A457', '#502C4D'], [
    ['Tangerine and Plum Spin', 'Tangerine orange arcs through coral and ripened plum.'],
    ['Tourbillon mandarine et prune', 'L’orange mandarine traverse le corail et la prune mûre.'],
    ['Giro de mandarina y ciruela', 'El naranja mandarina dibuja un arco entre coral y ciruela madura.'],
    ['Giro de tangerina e ameixa', 'O laranja-tangerina desenha um arco através de coral e ameixa madura.'],
    ['Wirbel aus Mandarine und Pflaume', 'Mandarinenorange zieht einen Bogen durch Koralle und reife Pflaume.'],
  ]),
  gradient(31, 'ink-to-periwinkle', linear(130), ['#182445', '#3D549A', '#777EC4', '#B2B9E3'], [
    ['Ink to Periwinkle', 'Blue ink fades through indigo into airy periwinkle.'],
    ['De l’encre à la pervenche', 'L’encre bleue passe par l’indigo jusqu’à la pervenche claire.'],
    ['De tinta a azul violáceo', 'La tinta azul pasa por índigo hasta un azul violáceo claro.'],
    ['Da tinta ao azul-lilás', 'A tinta azul passa pelo índigo até a um azul-lilás claro.'],
    ['Von Tinte zu Immergrünblau', 'Blaue Tinte verblasst über Indigo zu hellem Immergrünblau.'],
  ]),
  gradient(32, 'warm-sand-focus', radial(0.6, 0.51), ['#FBF2DB', '#DCC39C', '#A98C6E'], [
    ['Warm Sand Focus', 'A chalky cream center softens outward to sandy tan.'],
    ['Reflet de sable chaud', 'Un centre crème crayeux se fond dans un beige sable.'],
    ['Foco de arena cálida', 'Un centro crema de tiza se funde hacia un tostado arenoso.'],
    ['Foco de areia quente', 'Um centro creme de giz funde-se com um tom de areia tostada.'],
    ['Warmer Sandschein', 'Eine kreidig-cremefarbene Mitte geht in sandiges Lohbraun über.'],
  ]),
  gradient(33, 'aqua-and-gold-circle', conic(145), ['#258E92', '#79BFAF', '#F0CF77', '#CAA96B', '#258E92'], [
    ['Aqua and Gold Circle', 'Aqua and gold meet around a soft green transition.'],
    ['Cercle aqua et or', 'L’aqua et l’or se rejoignent par un vert doux.'],
    ['Círculo aguamarina y oro', 'El aguamarina y el oro se unen con una transición verde suave.'],
    ['Círculo água-marinha e ouro', 'O azul-água e o ouro encontram-se numa transição verde suave.'],
    ['Kreis aus Aqua und Gold', 'Aqua und Gold treffen über einen weichen grünen Übergang zusammen.'],
  ]),
  gradient(34, 'violet-to-raspberry', linear(75), ['#6954AC', '#9D538F', '#C6486B'], [
    ['Violet to Raspberry', 'True violet warms through orchid purple into raspberry red.'],
    ['Du violet à la framboise', 'Le violet se réchauffe en orchidée puis en rouge framboise.'],
    ['De violeta a frambuesa', 'El violeta se calienta en orquídea hasta un rojo frambuesa.'],
    ['Do violeta à framboesa', 'O violeta aquece em orquídea até ao vermelho-framboesa.'],
    ['Von Violett zu Himbeere', 'Violett wird über Orchidee zu warmem Himbeerrot.'],
  ]),
  gradient(35, 'frosted-teal', radial(0.31, 0.64), ['#E4F9F1', '#ABD6D1', '#5C999B', '#315F6B'], [
    ['Frosted Teal', 'Frosted mint at the center fades out to blue-green slate.'],
    ['Bleu canard givré', 'Le cœur menthe givrée se fond dans une ardoise bleu-vert.'],
    ['Verde azulado escarchado', 'La menta escarchada del centro se funde en pizarra azul verdosa.'],
    ['Verde-azulado gelado', 'A menta gelada do centro desvanece em ardósia azul-esverdeada.'],
    ['Gefrostetes Petrol', 'Gefrostete Minze in der Mitte verblasst zu blaugrünem Schiefer.'],
  ]),
  gradient(36, 'pastel-sherbet-wheel', conic(20), ['#F0B9C7', '#F9D0A3', '#EAE6AD', '#BFE2CE', '#C1C9E8', '#F0B9C7'], [
    ['Pastel Sherbet Wheel', 'Pale pink, apricot, lemon, mint, and lilac form a soft color wheel.'],
    ['Roue sorbet pastel', 'Rose pâle, abricot, citron, menthe et lilas forment une roue douce.'],
    ['Rueda de sorbete pastel', 'Rosa pálido, albaricoque, limón, menta y lila forman una rueda suave.'],
    ['Roda sorvete pastel', 'Rosa claro, damasco, limão, menta e lilás formam uma roda suave.'],
    ['Sorbet-Farbrad', 'Blasses Rosa, Aprikose, Zitrone, Minze und Flieder bilden ein weiches Farbrad.'],
  ]),
];
