/**
 * Frases diárias — motivacional + versículo bíblico.
 *
 * Comportamento: determinístico por (userId + dia). Cada consultor recebe
 * um par diferente todo dia. O mesmo consultor, no mesmo dia, sempre vê
 * o mesmo par (idempotente — não troca ao recarregar a página).
 *
 * Versículos: Antigo Testamento (Salmos, Provérbios, Isaías, Josué, etc).
 * Monoteísta puro, sem referências a Cristo/evangelho — compatível com
 * qualquer tradição que creia em um só Deus.
 */

export const FRASES_MOTIVACIONAIS: string[] = [
  "Cada \"não\" te aproxima do próximo \"sim\". Siga.",
  "O consultor que persiste no vale colhe no topo.",
  "Hoje é um bom dia pra se tornar referência.",
  "Protagonismo é mais raro que talento. Você escolheu bem.",
  "A disciplina de hoje é a liberdade de amanhã.",
  "Quem serve bem, vende sem esforço.",
  "O profissional mediano reclama do mercado. Você constrói o seu.",
  "Comece. O caminho se revela a quem anda.",
  "Vender é ajudar alguém a decidir pelo melhor.",
  "Repetição com propósito constrói impérios silenciosos.",
  "O que você faz nos próximos 90 minutos define sua semana.",
  "Você não precisa estar pronto. Precisa começar.",
  "Clientes compram certeza. Entregue certeza.",
  "A sua rotina é o seu teto. Suba a rotina, sobe o resultado.",
  "Nenhum vento é favorável a quem não sabe aonde vai. Hoje você sabe.",
  "O jogo é longo. Jogue bem o lance de hoje.",
  "Pequenas ações diárias superam grandes esforços esporádicos.",
  "Autoconfiança se treina. Treine hoje.",
  "O cliente de hoje é a indicação de amanhã.",
  "Simplifique. O que é simples converte.",
  "Você não vende apólice. Vende tranquilidade.",
  "Grandes consultores foram iniciantes insistentes.",
  "Ninguém chega sozinho. Mas ninguém chega sem decidir ir.",
  "A clareza nasce da ação, não do planejamento infinito.",
  "Trate cada cotação como se fosse pra sua família.",
  "Posicionamento vale mais que preço.",
  "A sua palavra é seu ativo. Cuide dela.",
  "Compare-se com quem você foi ontem. Só isso.",
  "O que você pratica, você se torna.",
  "O melhor momento pra ligar pro cliente é agora.",
  "A excelência é um hábito, não um evento.",
  "Não espere motivação. Comece e ela aparece.",
  "Cada contato é uma semente. Plante hoje.",
  "Resiliência é o combustível do consultor de alto nível.",
  "Sua missão hoje: deixar alguém melhor do que estava.",
  "Negócios bons nascem de conversas honestas.",
  "Faça o básico com paixão. É o que ninguém faz.",
  "Vendedor que escuta ganha mais que vendedor que fala.",
  "A sua reputação é construída pelo que você faz quando ninguém vê.",
  "A paciência vence o talento sem paciência.",
  "Hoje é dia de fazer algo que seu eu do futuro vai agradecer.",
  "Energia alta vende. Cuide da sua.",
  "Confiança não se exige — se demonstra.",
  "Fuja da zona de conforto. É lá que o teto está.",
  "A excelência está nos detalhes que ninguém percebe de imediato.",
  "O profissional de verdade entrega mesmo quando ninguém está olhando.",
  "Lembre-se por que começou. Isso basta pra continuar.",
  "A sua atitude é o seu diferencial. Nada mais.",
  "Hoje você escolhe: ou constrói, ou se acomoda.",
  "Comece pelo mais difícil. O resto flui.",
  "Transforme pressão em performance.",
  "Rotina simples, execução brutal — fórmula de topo.",
  "Vencer é se levantar uma vez a mais do que caiu.",
  "Humildade abre portas. Técnica te mantém dentro.",
  "O cliente lembra como você fez ele se sentir.",
  "Seu produto é bom. Seu papel é fazer ser visto.",
  "O mercado recompensa quem aparece todo dia.",
  "Hoje é terreno fértil. Planta o que quer colher.",
  "O impossível é opinião, não fato.",
  "Faça acontecer. O mundo precisa do que só você entrega.",
];

export interface Versiculo {
  texto: string;
  ref: string;
}

export const VERSICULOS: Versiculo[] = [
  { texto: "Seja forte e corajoso. Não se apavore nem desanime, pois o Senhor, o seu Deus, estará com você por onde você andar.", ref: "Josué 1:9" },
  { texto: "Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento.", ref: "Provérbios 3:5" },
  { texto: "O Senhor é o meu pastor; de nada terei falta.", ref: "Salmos 23:1" },
  { texto: "Posso todas as coisas naquele que me fortalece.", ref: "Filipenses 4:13" },
  { texto: "O Senhor é a minha luz e a minha salvação; de quem terei temor?", ref: "Salmos 27:1" },
  { texto: "Entregue o seu caminho ao Senhor; confie nele, e ele agirá.", ref: "Salmos 37:5" },
  { texto: "Deleite-se no Senhor, e ele atenderá aos desejos do seu coração.", ref: "Salmos 37:4" },
  { texto: "Buscai primeiro o Reino de Deus e a sua justiça, e tudo o mais será acrescentado.", ref: "Mateus 6:33" },
  { texto: "Tudo tem o seu tempo determinado, e há tempo para todo propósito debaixo do céu.", ref: "Eclesiastes 3:1" },
  { texto: "O Senhor é bom, uma fortaleza nos dias de angústia. Ele cuida dos que nele confiam.", ref: "Naum 1:7" },
  { texto: "Porque sou eu que conheço os planos que tenho para vocês — planos de fazê-los prosperar e não de causar dano, planos de dar esperança e um futuro.", ref: "Jeremias 29:11" },
  { texto: "Os que esperam no Senhor renovam as suas forças; voam alto como águias; correm e não ficam exaustos.", ref: "Isaías 40:31" },
  { texto: "Em tudo o que fizer, dependa do Senhor, e os seus planos darão certo.", ref: "Provérbios 16:3" },
  { texto: "O coração do homem traça o seu caminho, mas o Senhor lhe dirige os passos.", ref: "Provérbios 16:9" },
  { texto: "O Senhor é a minha força e o meu escudo; nele o meu coração confia.", ref: "Salmos 28:7" },
  { texto: "Se o Senhor não edificar a casa, em vão trabalham os que a constroem.", ref: "Salmos 127:1" },
  { texto: "Alegra-te no Senhor, e ele atenderá os desejos do teu coração.", ref: "Salmos 37:4" },
  { texto: "O temor do Senhor é o princípio da sabedoria.", ref: "Provérbios 9:10" },
  { texto: "O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti.", ref: "Números 6:24-25" },
  { texto: "Grandes coisas fez o Senhor por nós, por isso estamos alegres.", ref: "Salmos 126:3" },
  { texto: "Clama a mim, e eu te responderei e te mostrarei coisas grandes e firmes que não sabes.", ref: "Jeremias 33:3" },
  { texto: "Mesmo que eu ande pelo vale da sombra da morte, não temerei mal algum, porque tu estás comigo.", ref: "Salmos 23:4" },
  { texto: "A tua palavra é lâmpada para os meus pés e luz para o meu caminho.", ref: "Salmos 119:105" },
  { texto: "O Senhor pelejará por vós, e vós vos calareis.", ref: "Êxodo 14:14" },
  { texto: "Esforcem-se, animem o coração, todos vocês, que esperam no Senhor.", ref: "Salmos 31:24" },
  { texto: "Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.", ref: "Eclesiastes 9:10" },
  { texto: "O Senhor é a minha porção; portanto, nele esperarei.", ref: "Lamentações 3:24" },
  { texto: "As misericórdias do Senhor se renovam cada manhã; grande é a sua fidelidade.", ref: "Lamentações 3:22-23" },
  { texto: "Eu sei que o meu Redentor vive e por fim se levantará sobre a terra.", ref: "Jó 19:25" },
  { texto: "Melhor é o fim das coisas do que o seu princípio; melhor é o paciente do que o arrogante.", ref: "Eclesiastes 7:8" },
  { texto: "Nas suas angústias, clamaram ao Senhor, e ele os livrou das suas tribulações.", ref: "Salmos 107:6" },
  { texto: "O justo florescerá como a palmeira; crescerá como o cedro no Líbano.", ref: "Salmos 92:12" },
  { texto: "O Senhor dirige os passos do homem bom e tem prazer no seu caminho.", ref: "Salmos 37:23" },
  { texto: "Antes da queda, o coração do homem se exalta, mas a humildade antecede a honra.", ref: "Provérbios 18:12" },
  { texto: "O preguiçoso deseja e nada tem, mas a alma do diligente será prosperada.", ref: "Provérbios 13:4" },
  { texto: "Melhor é um bom nome do que grandes riquezas.", ref: "Provérbios 22:1" },
  { texto: "Lança o teu pão sobre as águas, porque depois de muitos dias o acharás.", ref: "Eclesiastes 11:1" },
  { texto: "A benção do Senhor é que enriquece, e ele não acrescenta dores a ela.", ref: "Provérbios 10:22" },
  { texto: "Quem anda com os sábios se torna sábio.", ref: "Provérbios 13:20" },
  { texto: "Se Deus é por nós, quem será contra nós?", ref: "Romanos 8:31" },
  { texto: "Alegrai-vos sempre. Orai sem cessar. Em tudo dai graças.", ref: "1 Tessalonicenses 5:16-18" },
  { texto: "O Senhor é compassivo e misericordioso, longânimo e grande em benignidade.", ref: "Salmos 103:8" },
  { texto: "Em paz me deitarei e dormirei, pois só tu, Senhor, me fazes repousar seguro.", ref: "Salmos 4:8" },
  { texto: "O Senhor dará força ao seu povo; o Senhor abençoará o seu povo com paz.", ref: "Salmos 29:11" },
  { texto: "Ensina-nos a contar os nossos dias, para que alcancemos coração sábio.", ref: "Salmos 90:12" },
  { texto: "O que semeia com lágrimas colherá com cânticos de alegria.", ref: "Salmos 126:5" },
  { texto: "O coração alegre é bom remédio.", ref: "Provérbios 17:22" },
  { texto: "Confia no Senhor e faze o bem; habita a terra e cultiva a fidelidade.", ref: "Salmos 37:3" },
  { texto: "Procura conhecer Deus em todos os seus caminhos, e ele endireitará as tuas veredas.", ref: "Provérbios 3:6" },
  { texto: "O Senhor é a minha rocha, a minha fortaleza e o meu libertador.", ref: "Salmos 18:2" },
  { texto: "Põe no Senhor as tuas obras, e os teus pensamentos serão estabelecidos.", ref: "Provérbios 16:3" },
  { texto: "Antes de serem formados teus olhos, o meu Deus já te conhecia.", ref: "Salmos 139:16" },
  { texto: "O Senhor cumprirá o seu propósito em meu favor.", ref: "Salmos 138:8" },
  { texto: "Se abro a sua mão, o Senhor satisfaz os desejos de todo ser vivente.", ref: "Salmos 145:16" },
  { texto: "Alegra-te na mocidade e trabalha com alegria.", ref: "Eclesiastes 11:9" },
  { texto: "Mantém-te firme na promessa do Senhor, pois o seu amor é para sempre.", ref: "Salmos 136:1" },
];

/**
 * Hash simples e determinístico (djb2 adaptado). Não precisa ser criptográfico —
 * só precisa produzir distribuição uniforme sobre o tamanho do array.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** YYYY-MM-DD em TZ local do usuário. */
function diaKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface FrasesDoDia {
  motivacional: string;
  versiculo: Versiculo;
}

/**
 * Retorna o par de frases do dia pro usuário.
 * - Mesmo usuário no mesmo dia → mesmo par (idempotente).
 * - Dois usuários no mesmo dia → pares diferentes (quase sempre; depende do hash).
 * - Mesmo usuário em dias diferentes → pares diferentes.
 *
 * `seed` deve identificar o consultor (userId do Supabase, email, ou nome
 * caso nada mais esteja disponível). Se vier vazio, usa só a data — todos
 * os anônimos veem o mesmo par naquele dia.
 */
export function getFrasesDoDia(seed: string | null | undefined, date: Date = new Date()): FrasesDoDia {
  const chave = `${seed ?? "anon"}::${diaKey(date)}`;
  const base = hashString(chave);
  // usa dois hashes distintos pra evitar correlação entre os dois índices
  const idxMotiv = base % FRASES_MOTIVACIONAIS.length;
  const idxVers = hashString("v::" + chave) % VERSICULOS.length;
  return {
    motivacional: FRASES_MOTIVACIONAIS[idxMotiv],
    versiculo: VERSICULOS[idxVers],
  };
}
