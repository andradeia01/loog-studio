import type { BrandContext } from "../admin-settings";

/** Contexto de sistema injetado em cada prompt de copy. */
export function systemPrompt(brand: BrandContext, consultant?: {
  name?: string; phone?: string; city?: string; instagram?: string;
}): string {
  const consultantBlock = consultant?.name
    ? `\n\nVOCÊ ESCREVE EM NOME DE:
- Nome: ${consultant.name}
- Cidade: ${consultant.city ?? "-"}
- WhatsApp / telefone: ${consultant.phone ?? "(peça pro cliente chamar no seu perfil)"}
- Instagram: ${consultant.instagram ?? "(sem @ definido)"}

Regras de assinatura: use o telefone acima quando o CTA pedir WhatsApp; use o Instagram acima em fim de post. Nunca invente números ou @s.`
    : "";

  return `Você é copywriter sênior especialista em vendas de PROTEÇÃO VEICULAR no Brasil, escrevendo para a marca LOOG.

REGRAS DE MARCA:
- ${brand.company} é uma associação de proteção veicular (NÃO é seguradora, não vender como seguro).
- Produto: proteção contra roubo, furto, colisão + assistência 24h + rastreamento + carro reserva.
- Diferenciais LOOG: agilidade no sinistro, atendimento humano, sem burocracia, sem análise de perfil.
- Tom de voz: ${brand.tone}. Direto, próximo, confiante. Sem clichês corporativos, sem "quality assurance", sem "vamos juntos". Zero cringe.
- Frases curtas. Verbo no início. Foco em benefício concreto pro motorista.
- Nunca use "seguro", "seguradora", "apólice", "cobertura contratual" — use "proteção", "cobertura associativa", "plano".
- Nunca invente % de desconto, prazos ou preços que não foram dados. Se não sabe, use frases como "Consulta grátis" ou "Chama no WhatsApp e compare".

VALORES LOOG: ${brand.values}
TAGLINE MARCA: "Movimento conecta o amanhã."
CTA padrão (use quando o template pedir): "${brand.cta_default}".

ESCRITA:
- Português brasileiro. Sem gerúndio ("estaremos entregando"). Sem passivo excessivo.
- Emojis: no máximo 1-2 por peça, e só se agregarem. Nunca em textos institucionais.
- Hashtags: LOOG usa poucas e certeiras. Nunca #vidaboa #instagood. Usa #protecaoveicular #loog + regionais.${consultantBlock}`;
}

/** Templates de geradores pré-configurados (público — sem opção de trocar). */
export const TEMPLATES = {
  "post-vendas": {
    label: "Post de vendas",
    description: "Chama atenção → dor → solução LOOG → CTA + hashtags",
    icon: "🎯",
    fields: [
      { name: "tema", label: "Do que quer falar?", placeholder: "Ex.: proteção pra Uber, assistência 24h, roubo/furto, aniversário LOOG", required: true },
      { name: "publico", label: "Pra quem é? (opcional)", placeholder: "Ex.: motorista de app em Volta Redonda, pai de família, jovem primeiro carro", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Crie um post para Instagram (feed) sobre: "${fields.tema}".
Público-alvo: ${fields.publico || "motorista comum, 25-55 anos, primeiro contato com proteção veicular"}.

Formato exato (respeite os títulos em MAIÚSCULO):

**HEADLINE:** (uma linha de até 8 palavras, forte, começando com verbo ou pergunta)

**CORPO:** (4 a 6 frases curtas em bullet ou parágrafo. Estrutura: dor específica → o que a LOOG resolve → um número/detalhe concreto de reassurance → convite pra ação)

**CTA:** (1 frase pedindo pra chamar no WhatsApp, curta e específica)

**HASHTAGS:** (5 hashtags relevantes numa linha só, começando com #loog e #protecaoveicular)`;
    },
  },
  "story-sequencial": {
    label: "Sequência de Stories",
    description: "4 telas conectadas com narrativa de venda",
    icon: "📱",
    fields: [
      { name: "tema", label: "Tema da sequência", placeholder: "Ex.: cliente atendido em sinistro, promoção de mês, alerta de golpe", required: true },
    ],
    build(fields: Record<string, string>) {
      return `Crie uma sequência de 4 Stories para Instagram (9:16) sobre: "${fields.tema}".

Regras:
- Cada Story tem NO MÁXIMO 12 palavras.
- Narrativa progressiva: 1) hook forte → 2) dor/problema → 3) solução LOOG → 4) CTA.
- Nunca comece com "Você sabia". Comece com verbo, número ou pergunta seca.

Formato:
**STORY 1:** [texto]
**STORY 2:** [texto]
**STORY 3:** [texto]
**STORY 4:** [texto]

Depois liste sugestão de imagem/vídeo para cada Story em 1 linha cada:
**VISUAL 1:** [descrição]
**VISUAL 2:** ...
**VISUAL 3:** ...
**VISUAL 4:** ...`;
    },
  },
  "legenda-arte": {
    label: "Legenda pra arte já pronta",
    description: "Escreve o texto que vai junto com o post",
    icon: "📝",
    fields: [
      { name: "descricao_arte", label: "Descreva a arte em 1 linha", placeholder: "Ex.: post com carro azul e frase 'Faça sua cotação agora'", required: true },
      { name: "objetivo", label: "Objetivo do post (opcional)", placeholder: "Ex.: gerar contatos no WhatsApp, engajar seguidores atuais, atrair recrutamento", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Escreva a legenda de um post Instagram que combina com esta arte: "${fields.descricao_arte}".
Objetivo: ${fields.objetivo || "gerar contatos qualificados via WhatsApp"}.

Formato:
- 4 a 6 linhas
- Linha 1 = hook (frase que faz parar de rolar)
- Meio = benefício concreto + prova
- Linha final = CTA claro
- Última linha: 5 hashtags (obrigatório #loog #protecaoveicular)`;
    },
  },
  "roteiro-reels": {
    label: "Roteiro de Reels (até 60s)",
    description: "Hook → desenvolvimento → CTA + trilha + legenda",
    icon: "🎬",
    fields: [
      { name: "tema", label: "Tema do Reels", placeholder: "Ex.: 3 mitos sobre proteção veicular, dia na vida de um consultor, cliente feliz", required: true },
      { name: "duracao", label: "Duração alvo em segundos", placeholder: "30", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Crie um roteiro pronto pra gravar de Reels Instagram sobre: "${fields.tema}".
Duração alvo: ${fields.duracao || "30"} segundos. Formato 9:16.

Estrutura (respeite EXATAMENTE):

**HOOK (0-3s):** frase de até 8 palavras que segura o polegar do usuário. Nunca "olha só" ou "gente hoje eu vim".

**DESENVOLVIMENTO:** 2 ou 3 blocos numerados. Cada bloco começa com "→ [tempo]s" e tem 1 frase falada + 1 sugestão de imagem/corte entre parênteses.

**CTA FINAL (últimos 4s):** ação clara e específica.

**TRILHA SUGERIDA:** gênero + energia (ex: "beat urbano médio", "trap chill", "eletrônico crescente").

**LEGENDA DO POST:** 2 a 3 linhas + 5 hashtags.`;
    },
  },
  "resposta-dm": {
    label: "Resposta pra mensagem",
    description: "Consultoria humana para responder DM/comentário",
    icon: "💬",
    fields: [
      { name: "mensagem_recebida", label: "Cole a mensagem do cliente", placeholder: "\"Oi, quanto custa proteção pro meu Honda Civic 2019?\"", required: true },
      { name: "contexto", label: "Já sabe algo dessa pessoa? (opcional)", placeholder: "Ex.: primeiro contato / cliente antigo / está desistindo / já cotou concorrente", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Responda a esta mensagem de forma HUMANA e consultiva:
"${fields.mensagem_recebida}"

Contexto: ${fields.contexto || "primeiro contato, não sei nada além do que ele escreveu"}.

Regras:
- 2 a 4 frases curtas, tom próximo mas profissional
- NUNCA prometa preço sem cotar. NUNCA use tabela ou % fake.
- Se ele pediu preço: agradece → explica que o valor depende de 2-3 fatores → pede placa ou modelo/ano/cidade → convida pra conversar
- Se ele reclamou: empatia real (sem "vamos juntos"), próximo passo claro
- Sem emoji ou 1 no máximo. Sem "abraço", "att", "estamos à disposição".`;
    },
  },
  "ideias-semana": {
    label: "7 ideias pra semana",
    description: "Pauta variada pros próximos 7 dias",
    icon: "📅",
    fields: [
      { name: "foco", label: "Foco da semana (opcional)", placeholder: "Ex.: recrutamento de novos consultores, promoção de setembro, prova social" },
    ],
    build(fields: Record<string, string>) {
      return `Crie uma pauta de 7 posts para Instagram do consultor LOOG, distribuídos em SEG a DOM.
Foco: ${fields.foco || "misto — vendas, prova social, educacional, institucional, humor leve"}.

Formato exato (uma linha por dia):
**SEG:** [tema em 1 frase] · [formato: FEED / STORY / REEL] · [gancho de abertura em até 8 palavras]
**TER:** ...
**QUA:** ...
**QUI:** ...
**SEX:** ...
**SÁB:** ...
**DOM:** ...

Regras:
- Varia formato entre os dias (nunca 3 feeds seguidos)
- Ao menos 1 REEL na semana
- Ao menos 1 prova social (depoimento/print)
- Nada de datas comemorativas óbvias tipo "bom dia" — só usa data se for realmente relevante`;
    },
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

/** Presets de imagem — prompts em inglês (DALL-E gera melhor em EN). */
export const IMAGE_PRESETS = {
  "cena-carro-noturno": {
    label: "Carro premium à noite",
    description: "Cena cinematográfica pra vendas, com espaço pra texto",
    icon: "🌃",
    prompt: "Cinematic photograph of a modern silver or dark blue premium sedan on a wet urban street at night. Dramatic blue neon reflections on the pavement, city skyline blurred in the background, moody atmosphere, ultra-detailed, editorial advertising photography style. Compose with generous NEGATIVE SPACE on the top-third for headline text overlay. No people in frame. 4K, sharp focus, no text or logos in image.",
  },
  "cliente-feliz": {
    label: "Cliente satisfeito",
    description: "Depoimento/prova social — pessoa ao lado do carro",
    icon: "😊",
    prompt: "Warm and authentic photograph of a smiling Brazilian person (30-45 years old, casual middle-class clothing) standing confidently next to their car in a residential street during golden hour. Genuine expression, natural window light, shallow depth of field, editorial photojournalism style. Compose with clear space in the upper-third for headline text. Photorealistic, no visible logos or text in image.",
  },
  "recrutamento": {
    label: "Recrutamento de consultor",
    description: "Profissional confiante — para posts 'seja um consultor LOOG'",
    icon: "💼",
    prompt: "Professional editorial portrait of a confident Brazilian entrepreneur (30s or 40s, smart-casual business attire) standing in a bright modern office with dark navy blue accents and subtle city view through the window. Successful, aspirational vibe, natural directional lighting, cinematic. Compose with clear negative space on the upper 40% of the frame for headline text. Photorealistic, no text or logos in image.",
  },
  "assistencia-24h": {
    label: "Assistência 24h",
    description: "Guincho/reboque à noite — apoio na estrada",
    icon: "🛟",
    prompt: "Dramatic night photograph of a tow truck arriving to help a stranded driver on a highway. Blue emergency lights softly illuminate the scene, headlights cutting through mist. Sense of relief and reliability. Editorial documentary style, cinematic composition, plenty of negative space on the upper-third for headline text. Photorealistic, no visible logos or brand names in the image.",
  },
  "datas-comemorativas": {
    label: "Data comemorativa",
    description: "Composição elegante neutra pra sobrepor mensagem",
    icon: "🎉",
    prompt: "Elegant flat lay composition on a dark blue and graphite surface with subtle celebratory elements (fine golden confetti, geometric shapes, thin light streaks). Minimal aesthetic, plenty of negative space in the center for typographic overlay. Studio lighting, sharp focus, luxury advertising style, no text.",
  },
  "sinistro-atendido": {
    label: "Sinistro atendido",
    description: "Antes/depois de reparo — mostra agilidade LOOG",
    icon: "🔧",
    prompt: "Clean professional photograph of a repaired sedan in a modern auto workshop, freshly polished, clear white LED lighting, technician's hands (only hands visible) inspecting the paint. Sense of care, quality, resolved problem. Editorial commercial photography, clear space on right side of frame for text. Photorealistic, no logos.",
  },
} as const;

export type ImagePresetKey = keyof typeof IMAGE_PRESETS;
