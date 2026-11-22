import { createGraph } from "./graph.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null,
  csrf: "",
  notebooks: [],
  connections: [],
  providers: [],
  progress: null,
  workspace: null,
  selected: new Set(),
  activeNotebook: null,
  page: "dashboard",
  panel: "chat",
  busy: false,
  filter: "",
  collapsed: new Set(),
  drafts: new Map(),
  locale: localStorage.getItem("folio-locale") || "en",
  updates: null, // desktop app only: see "Desktop updates"
};
// The Folio desktop app's update controls; null in a browser.
const desktopUpdates = window.folioDesktop?.updates || null;
const pt = {
  Dashboard: "Visão geral",
  "My notebooks": "Meus cadernos",
  "Recent activity": "Atividade recente",
  "Study sessions": "Sessões de estudo",
  Flashcards: "Cartões",
  Quizzes: "Questionários",
  "Learning progress": "Progresso",
  "AI connections": "Conexões de IA",
  Settings: "Configurações",
  "New notebook": "Novo caderno",
  "Sign out": "Sair",
  Study: "Estudo",
  Account: "Conta",
  "Change profile picture": "Alterar foto de perfil",
  "Remove profile picture": "Remover foto de perfil",
  "Choose a picture": "Escolher uma foto",
  "Crop preview": "Prévia do recorte",
  "Drag the picture or use arrow keys to move. Use + or − to zoom.":
    "Arraste a foto ou use as setas para mover. Use + ou − para ajustar o zoom.",
  "Blocked accounts": "Contas bloqueadas",
  "Block account": "Bloquear conta",
  Block: "Bloquear",
  Unblock: "Desbloquear",
  "Connected apps": "Aplicativos conectados",
  "Turn off web links": "Desativar links da web",
  "Turn on web links": "Ativar links da web",
  "Connect an app": "Conectar um aplicativo",
  "Customize notebook": "Personalizar caderno",
  "Copy notebook": "Copiar caderno",
  "Notebook activity": "Atividade do caderno",
  Longer: "Mais longa",
  Shorter: "Mais curta",
  "Your learning, connected.": "Seu aprendizado, conectado.",
  "A place to understand.": "Um lugar para compreender.",
  "Create your account": "Crie sua conta",
  "Welcome back": "Boas-vindas",
  Name: "Nome",
  Email: "E-mail",
  Password: "Senha",
  "Create account": "Criar conta",
  "Sign in": "Entrar",
  "Continue as guest": "Continuar como visitante",
  Title: "Título",
  Description: "Descrição",
  Cancel: "Cancelar",
  "Create notebook": "Criar caderno",
  Sources: "Fontes",
  Chat: "Conversa",
  "Study studio": "Estúdio de estudos",
  "Add sources": "Adicionar fontes",
  "Add a note": "Adicionar nota",
  "Your notebooks": "Seus cadernos",
  "View all": "Ver todos",
  Collections: "Coleções",
  All: "Todos",
  "New collection": "Nova coleção",
  "Rename collection": "Renomear coleção",
  "Delete collection": "Excluir coleção",
  "Collection options": "Opções da coleção",
  "Collection name": "Nome da coleção",
  "Add to a collection": "Adicionar a uma coleção",
  "No collections yet.": "Nenhuma coleção ainda.",
  "The notebooks in this collection are kept.":
    "Os cadernos desta coleção são mantidos.",
  Done: "Concluir",
  "Sort sources": "Ordenar fontes",
  "Date added": "Data de adição",
  Type: "Tipo",
  "No topic": "Sem tópico",
  "Set topic": "Definir tópico",
  "Leave empty to remove the topic.": "Deixe vazio para remover o tópico.",
  "Auto-label": "Rotular automaticamente",
  "Sources labelled.": "Fontes rotuladas.",
  "Good response": "Boa resposta",
  "Bad response": "Resposta ruim",
  Infographic: "Infográfico",
  "The big picture on one page": "A visão geral em uma página",
  "Key takeaway": "Ideia principal",
  "Export HTML": "Exportar HTML",
  "Open notebook": "Abrir caderno",
  "No notebooks yet": "Nenhum caderno ainda",
  "Cards due": "Cartões para revisar",
  "Cards reviewed": "Cartões revisados",
  "Quizzes completed": "Questionários concluídos",
  "A little clarity, every day.": "Um pouco de clareza, todos os dias.",
  "Ask, explore, understand.": "Pergunte, explore, compreenda.",
  "Study guide": "Guia de estudo",
  Quiz: "Questionário",
  "Mind map": "Mapa mental",
  "Data table": "Tabela de dados",
  Note: "Nota",
  "Saved resources": "Recursos salvos",
  Generate: "Gerar",
  Save: "Salvar",
  Delete: "Excluir",
  Export: "Exportar",
  Download: "Baixar",
  Close: "Fechar",
  "Search sources": "Buscar fontes",
  "Search notebooks": "Buscar cadernos",
  Language: "Idioma",
  "Interface language": "Idioma da interface",
  "Folio version": "Versão do Folio",
  "You are running Folio": "Você está usando o Folio",
  "New update": "Nova atualização",
  Updates: "Atualizações",
  "Update automatically": "Atualizar automaticamente",
  Yes: "Sim",
  No: "Não",
  "Folio downloads new versions by itself and installs them when you quit.":
    "O Folio baixa as novas versões sozinho e as instala quando você o fecha.",
  "Folio still checks for new versions. When one is out, a New update button appears in the top bar and you choose when to install it.":
    "O Folio continua procurando novas versões. Quando sair uma, aparece o botão Nova atualização na barra superior e você escolhe quando instalar.",
  "Updates work in the installed app. This copy runs from the source code.":
    "As atualizações funcionam no aplicativo instalado. Esta cópia roda a partir do código-fonte.",
  "This copy of Folio does not update itself. Download new versions from GitHub.":
    "Esta cópia do Folio não se atualiza sozinha. Baixe as novas versões no GitHub.",
  "Check for updates": "Procurar atualizações",
  "Checking for updates…": "Procurando atualizações…",
  "Folio is up to date.": "O Folio está atualizado.",
  "View updates": "Ver atualizações",
  "1 update can be installed.": "1 atualização pode ser instalada.",
  "updates can be installed.": "atualizações podem ser instaladas.",
  "will install when you quit Folio.":
    "será instalado quando você fechar o Folio.",
  Downloading: "Baixando",
  "Downloading…": "Baixando…",
  Install: "Instalar",
  Latest: "Mais recente",
  "No release notes.": "Sem notas da versão.",
  "Installing closes Folio, puts the new version in place and opens it again. Your notebooks and settings are kept.":
    "Instalar fecha o Folio, coloca a nova versão no lugar e o abre de novo. Seus cadernos e configurações são mantidos.",
  "Installing the update. Folio will reopen.":
    "Instalando a atualização. O Folio vai abrir de novo.",
  "Folio is up to date. There is nothing to install.":
    "O Folio está atualizado. Não há nada para instalar.",
  "Explanation language": "Idioma das explicações",
  Theme: "Tema",
  Light: "Claro",
  Dark: "Escuro",
  "Teaching style": "Estilo de ensino",
  "Notebook settings": "Configurações do caderno",
  "Custom instructions": "Instruções personalizadas",
  "Strict sources": "Somente fontes",
  "Broader knowledge": "Conhecimento geral",
  "Choose a model": "Escolha um modelo",
  "Connect a provider": "Conectar um provedor",
  Send: "Enviar",
  "Try again": "Tentar novamente",
  Processing: "Processando",
  Ready: "Pronto",
  Failed: "Falhou",
  Queued: "Na fila",
  Cancelled: "Cancelado",
  "Select all": "Selecionar todas",
  "Deselect all": "Desmarcar todas",
  selected: "selecionadas",
  "No saved resources yet.": "Nenhum recurso salvo ainda.",
  Connect: "Conectar",
  Provider: "Provedor",
  "Connection name": "Nome da conexão",
  "API key": "Chave de API",
  "Connected providers": "Provedores conectados",
  "Refresh models": "Atualizar modelos",
  Disconnect: "Desconectar",
  Models: "Modelos",
  "Study preferences": "Preferências de estudo",
  "Select a notebook": "Selecione um caderno",
  "No activity yet.": "Nenhuma atividade ainda.",
  "Reveal answer": "Revelar resposta",
  Again: "Repetir",
  Hard: "Difícil",
  Good: "Bom",
  Easy: "Fácil",
  Next: "Próximo",
  Shuffle: "Embaralhar",
  "Question types": "Tipos de pergunta",
  "Multiple choice": "Múltipla escolha",
  "Multiple select": "Seleção múltipla",
  "Fill in the blank": "Preencher a lacuna",
  "Short answer": "Resposta curta",
  "Select all that apply.": "Selecione todas as corretas.",
  "Type your answer": "Digite sua resposta",
  "Check answer": "Verificar resposta",
  "Accepted answer": "Resposta aceita",
  "Correct, chosen": "Correta, escolhida",
  "Answer length": "Tamanho da resposta",
  Short: "Curta",
  Default: "Padrão",
  Long: "Longa",
  Glossary: "Glossário",
  "Comparison document": "Documento de comparação",
  "Briefing document, FAQ, timeline, glossary":
    "Síntese, perguntas frequentes, linha do tempo, glossário",
  "Learning overview": "Visão geral de aprendizagem",
  "Study in four stages": "Estude em quatro etapas",
  "stages ready": "etapas prontas",
  Introduction: "Introdução",
  "Visual explanation": "Explicação visual",
  Assessment: "Avaliação",
  "Read the study guide first.": "Leia primeiro o guia de estudo.",
  "See the big picture on one page.": "Veja o panorama em uma página.",
  "Recall the key ideas with flashcards.":
    "Relembre as ideias principais com flashcards.",
  "Test yourself and review your mistakes.": "Teste-se e revise seus erros.",
  Open: "Abrir",
  Create: "Criar",
  "Study prompts": "Prompts de estudo",
  "Pick a prompt to place it in the chat box. Edit it before you send.":
    "Escolha um prompt para colocá-lo na caixa do chat. Edite antes de enviar.",
  "Complete study guide": "Guia de estudo completo",
  "Every section and definition, with a topic checklist.":
    "Cada seção e definição, com uma lista de tópicos.",
  "One concept at a time; you answer before it corrects.":
    "Um conceito por vez; você responde antes da correção.",
  "Tricky multiple choice, answers only at the end.":
    "Múltipla escolha difícil, respostas só no final.",
  "A table of look-alike ideas, then questions on them.":
    "Uma tabela de ideias parecidas e perguntas sobre elas.",
  "Tests every topic and sorts your mistakes by kind.":
    "Testa todos os tópicos e classifica seus erros por tipo.",
  "Personal tutor": "Tutor pessoal",
  "Hard practice exam": "Simulado difícil",
  "Confusing concepts": "Conceitos confusos",
  "Final readiness check": "Verificação final de preparo",
  "Using only my selected sources, write a complete, well-organized study guide. Cover every major section, definition, distinction, process, formula and example that an exam could ask about. Keep the sources' exact technical terms, cite the sources, and finish with a checklist of the topics covered.":
    "Usando apenas as fontes selecionadas, escreva um guia de estudo completo e bem organizado. Cubra cada seção, definição, distinção, processo, fórmula e exemplo que uma prova possa cobrar. Mantenha os termos técnicos exatos das fontes, cite as fontes e termine com uma lista dos tópicos cobertos.",
  "Act as an expert tutor preparing me for an exam. Teach the selected material one concept at a time, from clear explanations to harder applications. Ask me a question after each concept and wait for my attempt before you correct it. Explain my mistakes with citations.":
    "Aja como um tutor especialista me preparando para uma prova. Ensine o material selecionado um conceito por vez, de explicações claras a aplicações mais difíceis. Faça uma pergunta após cada conceito e espere minha tentativa antes de corrigir. Explique meus erros com citações.",
  "Give me a challenging multiple-choice practice exam on my selected sources: definitions, comparisons, applications and common misconceptions, with plausible wrong options. Ask the questions without revealing the answers. When I finish, give the answers, explanations and the topics I should review.":
    "Faça um simulado difícil de múltipla escolha sobre as fontes selecionadas: definições, comparações, aplicações e equívocos comuns, com alternativas erradas plausíveis. Faça as perguntas sem revelar as respostas. Quando eu terminar, dê as respostas, as explicações e os tópicos que devo revisar.",
  "Find the concepts in the selected sources that students most often confuse: similar definitions, competing theories, close dates, or formulas with similar uses. Make a comparison table of the exact differences, then give me practice questions that tell them apart.":
    "Encontre nas fontes selecionadas os conceitos que os estudantes mais confundem: definições parecidas, teorias concorrentes, datas próximas ou fórmulas de uso semelhante. Faça uma tabela comparando as diferenças exatas e depois me dê perguntas para distingui-los.",
  "Check whether I know this material well enough for an exam. Test me on a balanced selection of topics from all selected sources, one question at a time. After my answers, sort my mistakes into knowledge gaps, misunderstandings, application errors and careless errors, and recommend topics and source sections to review.":
    "Verifique se eu sei este material bem o suficiente para uma prova. Teste-me com uma seleção equilibrada de tópicos de todas as fontes selecionadas, uma pergunta por vez. Depois das respostas, classifique meus erros em lacunas de conhecimento, mal-entendidos, erros de aplicação e descuidos, e recomende tópicos e trechos das fontes para revisar.",
  "Edit card": "Editar cartão",
  "Add card": "Adicionar cartão",
  Front: "Frente",
  Back: "Verso",
  "Flag for correction": "Sinalizar para corrigir",
  "Submit quiz": "Enviar respostas",
  "Retake quiz": "Refazer questionário",
  "Review mistakes": "Revisar erros",
  "Review topics": "Tópicos para revisar",
  Correct: "Correto",
  Incorrect: "Incorreto",
  "No answer": "Sem resposta",
  "Show hint": "Mostrar dica",
  "Focus (optional)": "Foco (opcional)",
  "Number of items": "Quantidade de itens",
  Difficulty: "Dificuldade",
  "Source passages": "Trechos das fontes",
  "Connection removed.": "Conexão removida.",
  "Saved.": "Salvo.",
  "Notebook created.": "Caderno criado.",
  "Upload queued.": "Envio na fila.",
  "Generate from sources": "Gerar a partir das fontes",
  Source: "Fonte",
  Page: "Página",
  Section: "Seção",
  Edit: "Editar",
  "Text / Markdown": "Texto / Markdown",
  "Save note": "Salvar nota",
  "Export notebook": "Exportar caderno",
  "Delete notebook": "Excluir caderno",
  "Progress comes from practice.": "O progresso vem da prática.",
  "Your data": "Seus dados",
  "Delete account and data": "Excluir conta e dados",
  "Cancel generation": "Cancelar geração",
  Regenerate: "Gerar novamente",
  "Save as note": "Salvar como nota",
  Copy: "Copiar",
  "Semantic indexing": "Indexação semântica",
  "Enable hybrid retrieval": "Ativar busca híbrida",
  "Index selected sources": "Indexar fontes selecionadas",
  "Embedding model": "Modelo de embeddings",
  Optional: "Opcional",
  "Download original": "Baixar original",
  Cards: "Cartões",
  "Due now": "Para revisar agora",
  "All cards": "Todos os cartões",
  "No cards are due.": "Nenhum cartão para revisar agora.",
  "Study session complete": "Sessão de estudo concluída",
  "Review saved.": "Revisão salva.",
  "Choose a source to inspect.": "Escolha uma fonte para consultar.",
  Question: "Pergunta",
  "Source-grounded": "Baseado nas fontes",
  "Sources stay with your notebook when you switch models.":
    "As fontes permanecem no caderno ao trocar de modelo.",
  "Use a unique password of at least 12 characters.":
    "Use uma senha única com pelo menos 12 caracteres.",
  "Your provider password is never requested. API billing may be separate from chat subscriptions.":
    "Nunca pedimos a senha do provedor. A cobrança da API pode ser separada da assinatura de chat.",
  "No provider connected.": "Nenhum provedor conectado.",
  "Connect an authorized provider to generate study resources.":
    "Conecte um provedor autorizado para gerar recursos de estudo.",
  "Working…": "Processando…",
  "No practice recorded yet.": "Nenhuma prática registrada ainda.",
  "Load a sample source": "Carregar uma fonte de exemplo",
  "Import notes, a chapter, or a worksheet to begin.":
    "Importe notas, um capítulo ou uma atividade para começar.",
  "Add PDF, Word, PowerPoint, EPUB, TXT, Markdown or CSV files (10 MB each).":
    "Adicione PDF, Word, PowerPoint, EPUB, TXT, Markdown ou CSV (10 MB cada).",
  "Your material is sent only to the provider you select.":
    "Seu material é enviado apenas ao provedor selecionado.",
  "Markdown content": "Conteúdo Markdown",
  "Paste source text": "Colar texto de uma fonte",
  "Suggest questions": "Sugerir perguntas",
  "Refresh questions": "Atualizar perguntas",
  "Questions ready.": "Perguntas prontas.",
  "Add from the web": "Adicionar da web",
  "Web address": "Endereço da web",
  "Add web page": "Adicionar página da web",
  "Enter a web address first.": "Digite um endereço da web primeiro.",
  "Paste a public article, file, YouTube video or Reddit link. Folio reads YouTube transcripts and public Reddit posts and comments.":
    "Cole um artigo público, arquivo, vídeo do YouTube ou link do Reddit. O Folio lê transcrições do YouTube e publicações e comentários públicos do Reddit.",
  "Web page, PDF, YouTube or Reddit link":
    "Página da web, PDF ou link do YouTube ou Reddit",
  "Search Reddit": "Pesquisar no Reddit",
  "Search terms": "Termos de pesquisa",
  "Subreddit (optional)": "Subreddit (opcional)",
  "Add Reddit results": "Adicionar resultados do Reddit",
  "Connect Google Drive": "Conectar o Google Drive",
  "Disconnect Google Drive": "Desconectar o Google Drive",
  "Check connection": "Verificar conexão",
  "Open Google sign-in": "Abrir login do Google",
  "Google Drive connected.": "Google Drive conectado.",
  "Google Drive disconnected.": "Google Drive desconectado.",
  "New document title": "Título do novo documento",
  "Or paste a Google Docs link to edit":
    "Ou cole o link do Google Docs para editar",
  "Exact text to replace (leave blank to append)":
    "Texto exato a substituir (deixe em branco para acrescentar)",
  "Instructions for the draft": "Instruções para o rascunho",
  "Generate Drive draft": "Gerar rascunho para o Drive",
  "Review Drive draft": "Revisar rascunho para o Drive",
  "Save to Google Drive": "Salvar no Google Drive",
  "Saved to Google Drive": "Salvo no Google Drive",
  "Open Google Doc": "Abrir no Google Docs",
  "Add text as source": "Adicionar texto como fonte",
  "Search resources": "Buscar recursos",
  "Manual deck": "Baralho manual",
  "Create deck": "Criar baralho",
  "Import CSV": "Importar CSV",
  "Export CSV": "Exportar CSV",
  Zoom: "Zoom",
  "Rename node": "Renomear nó",
  "Add child": "Adicionar filho",
  "Delete branch": "Excluir ramo",
  "Explore this topic": "Explorar este tópico",
  "Sign in to Folio": "Entrar no Folio",
  "Already have an account?": "Já tem uma conta?",
  "New here?": "Primeira visita?",
  "Create a free account": "Criar uma conta",
  "Data is saved on this server. Guest access depends on this browser session.":
    "Os dados ficam neste servidor. O acesso de visitante depende da sessão deste navegador.",
  "Turn your sources into understanding. Ask a question, connect the ideas, and follow the evidence.":
    "Transforme suas fontes em conhecimento. Faça uma pergunta, conecte as ideias e acompanhe as evidências.",
  "The ideas that matter": "As ideias essenciais",
  "Make it memorable": "Para lembrar melhor",
  "Put yourself to the test": "Teste seu conhecimento",
  "Connect the dots": "Conecte as ideias",
  "See it side by side": "Compare lado a lado",
  "A space for your thoughts": "Um espaço para suas ideias",
  "Your ideas take shape here.": "Suas ideias ganham forma aqui.",
  "Create a study tool above. Everything you save stays in this notebook.":
    "Crie uma ferramenta de estudo acima. Tudo que você salvar fica neste caderno.",
  "Summarize the main ideas": "Resuma as ideias principais",
  "Explain a difficult concept step by step":
    "Explique um conceito difícil passo a passo",
  "Compare the key concepts": "Compare os conceitos principais",
  Reports: "Relatórios",
  "Briefing document": "Documento de síntese",
  FAQ: "Perguntas frequentes",
  Timeline: "Linha do tempo",
  "Report format": "Formato do relatório",
  "Slide deck": "Apresentação",
  "Present the key ideas": "Apresente as ideias principais",
  "Choose a format for your sources": "Escolha um formato para suas fontes",
  "Convert to source": "Converter em fonte",
  "A separate copy is added to Sources. Later edits to this note will not update the copy.":
    "Uma cópia separada será adicionada às fontes. Edições posteriores desta nota não atualizarão a cópia.",
  "Search in source": "Buscar nesta fonte",
  "No matching passages.": "Nenhum trecho encontrado.",
  "Ask about this source": "Perguntar sobre esta fonte",
  "Summarize this source": "Resumir esta fonte",
  "Only this source will be selected for your next question.":
    "Somente esta fonte será selecionada para a próxima pergunta.",
  "Hide sources": "Ocultar fontes",
  "Show sources": "Mostrar fontes",
  "Hide studio": "Ocultar estúdio",
  "Show studio": "Mostrar estúdio",
  "Notebook overview": "Visão geral do caderno",
  "Create an overview": "Criar uma visão geral",
  "Search saved resources": "Buscar recursos salvos",
  "No matching resources.": "Nenhum recurso encontrado.",
  "Speaker notes": "Notas do apresentador",
  Previous: "Anterior",
  "Download slides": "Baixar apresentação",
  "Your AI provider": "Seu provedor de IA",
  source: "fonte",
  sources: "fontes",
  Studio: "Estúdio",
  "Just now": "Agora mesmo",
  "Recent notebooks": "Cadernos recentes",
  "Your study": "Seus estudos",
  "Create new notebook": "Criar novo caderno",
  "No matching notebooks.": "Nenhum caderno encontrado.",
  "Sort notebooks": "Ordenar cadernos",
  "Most recent": "Mais recentes",
  "Most sources": "Mais fontes",
  "Grid view": "Grade",
  "List view": "Lista",
  Icon: "Ícone",
  "Change icon": "Alterar ícone",
  Rename: "Renomear",
  "Rename notebook": "Renomear caderno",
  "Rename source": "Renomear fonte",
  "Notebook options": "Opções do caderno",
  "Source options": "Opções da fonte",
  "Resource options": "Opções do recurso",
  "Chat options": "Opções da conversa",
  "Configure chat": "Configurar conversa",
  "Remove source": "Remover fonte",
  "Select all sources": "Selecionar todas as fontes",
  "No matching sources.": "Nenhuma fonte encontrada.",
  "Saved sources will appear here": "As fontes salvas aparecerão aqui",
  "Click Add sources to upload PDFs, Word documents, text, Markdown or CSV files.":
    "Clique em Adicionar fontes para enviar PDFs, documentos do Word, texto, Markdown ou CSV.",
  "Ask a question or create something…": "Faça uma pergunta ou crie algo…",
  "Upload a source to get started": "Envie uma fonte para começar",
  "Let’s start your notebook…": "Vamos começar seu caderno…",
  "This is your blank canvas to understand, create, or make progress on something new. Add your own sources to get started.":
    "Esta é sua tela em branco para compreender, criar ou avançar em algo novo. Adicione suas fontes para começar.",
  "What would you like this notebook to help you do?":
    "Como este caderno pode ajudar você?",
  "Upload a file": "Enviar um arquivo",
  "Connect an AI provider": "Conectar um provedor de IA",
  "Create an overview, then pin the answer as this notebook’s summary.":
    "Crie uma visão geral e fixe a resposta como resumo deste caderno.",
  "Edit summary": "Editar resumo",
  "Write a summary": "Escrever um resumo",
  "Notebook summary": "Resumo do caderno",
  Summary: "Resumo",
  "Add note": "Adicionar nota",
  "Audio overview": "Resumo em áudio",
  "Briefing doc": "Documento de síntese",
  "Suggested questions": "Perguntas sugeridas",
  "Explain that more simply": "Explique de forma mais simples",
  "Give me a concrete example": "Dê um exemplo concreto",
  "Quiz me on this": "Faça perguntas sobre isso",
  "What should I review next?": "O que devo revisar agora?",
  "Save to note": "Salvar em nota",
  "Use as notebook summary": "Usar como resumo do caderno",
  "Save chat as note": "Salvar conversa como nota",
  "Download chat": "Baixar conversa",
  "Clear chat history": "Limpar histórico da conversa",
  "Studio output will be saved here.":
    "Os resultados do estúdio serão salvos aqui.",
  "After adding sources, click to create an audio overview, study guide, mind map and more!":
    "Depois de adicionar fontes, crie um resumo em áudio, guia de estudo, mapa mental e muito mais!",
  "Folio can be inaccurate; please double-check its responses.":
    "O Folio pode cometer erros; confira as respostas.",
  "Account menu": "Menu da conta",
  "Notebook title": "Título do caderno",
  "Folio home": "Início do Folio",
  "Audio format": "Formato do áudio",
  "Deep dive": "Análise aprofundada",
  Brief: "Breve",
  Critique: "Crítica",
  Debate: "Debate",
  Play: "Reproduzir",
  Pause: "Pausar",
  Resume: "Continuar",
  Restart: "Reiniciar",
  Speed: "Velocidade",
  Voice: "Voz",
  "Download transcript": "Baixar transcrição",
  "Knowledge graph": "Grafo de conhecimento",
  "Graph view": "Visualização em grafo",
  Graph: "Grafo",
  "All notebooks": "Todos os cadernos",
  "Graph scope": "Escopo do grafo",
  "See how your sources, saved resources and topics connect.":
    "Veja como suas fontes, recursos salvos e tópicos se conectam.",
  "Search the graph": "Buscar no grafo",
  Notebooks: "Cadernos",
  Notebook: "Caderno",
  Resources: "Recursos",
  Topics: "Tópicos",
  Topic: "Tópico",
  Connections: "Conexões",
  "No connections yet.": "Ainda sem conexões.",
  "Open source": "Abrir fonte",
  "Open resource": "Abrir recurso",
  "Zoom in": "Aproximar",
  "Zoom out": "Afastar",
  "Fit to view": "Ajustar à tela",
  node: "item",
  nodes: "itens",
  link: "ligação",
  links: "ligações",
  "Nothing to map yet.": "Nada para mapear ainda.",
  "Create a notebook and add sources to see how your material connects.":
    "Crie um caderno e adicione fontes para ver como seu material se conecta.",
  "Graph unavailable.": "Grafo indisponível.",
  "This notebook could not be loaded.":
    "Não foi possível carregar este caderno.",
  "Drag to move · scroll to zoom · double-click to open":
    "Arraste para mover · role para ampliar · clique duas vezes para abrir",
  "Add sources and create study resources to grow this graph.":
    "Adicione fontes e crie recursos de estudo para expandir este grafo.",
  "Knowledge graph. Drag to move, scroll to zoom, select an item to see its connections.":
    "Grafo de conhecimento. Arraste para mover, role para ampliar e selecione um item para ver suas conexões.",
  Effort: "Esforço",
  "Reasoning effort": "Esforço de raciocínio",
  "Folio picks the effort for each task":
    "O Folio escolhe o esforço para cada tarefa",
  "Quick answers, fewest tokens": "Respostas rápidas, menos tokens",
  "Balanced depth and cost": "Equilíbrio entre profundidade e custo",
  "Deeper reasoning": "Raciocínio mais profundo",
  "Very thorough, slower": "Muito detalhado, mais lento",
  "Maximum reasoning, most tokens": "Raciocínio máximo, mais tokens",
  "Let Folio choose": "Deixar o Folio escolher",
  "Reset to recommended": "Voltar ao recomendado",
  "Applies to reasoning models; others ignore it.":
    "Vale para modelos de raciocínio; os demais ignoram.",
  Use: "Usar",
  "Entire notebook": "Caderno inteiro",
  "Selected sources": "Fontes selecionadas",
  Medium: "Médio",
  Adaptive: "Adaptativo",
  "Adaptive targets your weak concepts.":
    "O modo adaptativo prioriza os conceitos em que você mais erra.",
  Definitions: "Definições",
  "Key concepts": "Conceitos-chave",
  "Questions & answers": "Perguntas e respostas",
  "Exam preparation": "Preparação para prova",
  Mixed: "Misto",
  "Spaced repetition": "Repetição espaçada",
  "Schedule each card for review with FSRS.":
    "Agenda a revisão de cada cartão com o FSRS.",
  "Include explanations": "Incluir explicações",
  "Add a short explanation to every card.":
    "Adiciona uma explicação curta a cada cartão.",
  "Based on deck:": "Baseado no baralho:",
  "Questions come from this deck's cards.":
    "As perguntas vêm dos cartões deste baralho.",
  "Number of cards": "Quantidade de cartões",
  "Number of questions": "Quantidade de perguntas",
  Custom: "Personalizado",
  "Custom instructions (optional)": "Instruções personalizadas (opcional)",
  Focus: "Foco",
  "Regenerating…": "Gerando novamente…",
  Progress: "Progresso",
  Explain: "Explicar",
  "Study mode": "Modo de estudo",
  Due: "Para revisar",
  Missed: "Errados",
  "Card {n} of {total}": "Cartão {n} de {total}",
  Answer: "Resposta",
  "Press Space to flip": "Pressione Espaço para virar",
  Flagged: "Sinalizado",
  "Tap to flip": "Toque para virar",
  "Study again": "Estudar de novo",
  "Know it": "Já sei",
  min: "min",
  h: "h",
  d: "d",
  mo: "m",
  y: "a",
  "This deck has no cards yet.": "Este baralho ainda não tem cartões.",
  "Add a card or import a CSV to start.":
    "Adicione um cartão ou importe um CSV para começar.",
  "No missed cards.": "Nenhum cartão errado.",
  "Study all cards": "Estudar todos os cartões",
  "Review missed cards": "Revisar cartões errados",
  "Make a quiz from this deck": "Criar um questionário deste baralho",
  "Open the source to read this passage.":
    "Abra a fonte para ler esta passagem.",
  "Why this answer is correct": "Por que esta resposta está correta",
  "Detailed understanding": "Compreensão detalhada",
  "Simple explanation": "Explicação simples",
  "Practical example": "Exemplo prático",
  "Source reference": "Referência da fonte",
  "No source passage was cited.": "Nenhuma passagem da fonte foi citada.",
  "Add as a new card": "Adicionar como novo cartão",
  "Ask Folio AI": "Perguntar ao Folio AI",
  "Ask a follow-up question": "Faça uma pergunta de acompanhamento",
  "Explaining…": "Explicando…",
  "Instructions (optional)": "Instruções (opcional)",
  "Folio AI rewrites this card from your sources. Your review history is kept.":
    "O Folio AI reescreve este cartão a partir das suas fontes. Seu histórico de revisão é mantido.",
  "Delete this card?": "Excluir este cartão?",
  Flag: "Sinalizar",
  Unflag: "Remover sinalização",
  "Due + new": "Para revisar + novos",
  New: "Novos",
  Notes: "Notas",
  "Use note": "Usar a nota",
  More: "Mais",
  Practice: "Praticar",
  "Focus on": "Foco em",
  "Hint (optional)": "Dica (opcional)",
  "Explanation (optional)": "Explicação (opcional)",
  "Make flashcards from missed answers":
    "Criar cartões a partir das respostas erradas",
  "Flashcards created from your missed answers.":
    "Cartões criados a partir das suas respostas erradas.",
  "Weak concepts": "Conceitos fracos",
  "No weak concepts yet.": "Nenhum conceito fraco ainda.",
  "Card added.": "Cartão adicionado.",
  "Card regenerated.": "Cartão gerado novamente.",
  "Card updated.": "Cartão atualizado.",
  "Card flagged.": "Cartão sinalizado.",
  "Flag removed.": "Sinalização removida.",
};
const t = (text) => (state.locale === "pt-BR" ? pt[text] || text : text);
const paths = {
  book: "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z",
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3z",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  cards: "M7 3h14v15H7z M3 7v14h14",
  quiz: "M8 3h12v18H4V3h4 M8 3V1h8v4H8z M8 10h8 M8 15h5",
  chart: "M4 3v17h17 M8 15v-4 M13 15V7 M18 15V4",
  plug: "M8 3v5 M16 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 2h6l1 4 4 1 2 5-3 3v4l-5 3-3-3H7l-5-5 3-3V7z",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M18 6 6 18",
  arrow: "M5 12h14 M14 6l6 6-6 6",
  chevron: "M9 5l7 7-7 7",
  file: "M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h6",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5",
  spark: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  map: "M12 3v7 M5 14v6 M19 14v6 M12 10H5v4 M12 10h7v4 M9 2h6v4H9z M2 19h6v4H2z M16 19h6v4h-6z",
  table: "M3 3h18v18H3z M3 9h18 M9 3v18 M3 15h18",
  note: "M5 3h14v14l-5 5H5z M14 22v-5h5 M8 8h8 M8 12h6",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  edit: "M4 17 17 4l3 3L7 20l-4 1z M14 7l3 3",
  download: "M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4",
  check: "M4 12l5 5L20 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
  logout: "M9 3H3v18h6 M10 12h12 M17 7l5 5-5 5",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  copy: "M8 8h13v13H8z M16 8V3H3v13h5",
  slides: "M3 4h18v13H3z M12 17v5 M7 22h10 M7 8h10 M7 12h6",
  more: "M12 5.5h.01 M12 12h.01 M12 18.5h.01",
  panelLeft: "M4 4h16v16H4z M9.5 4v16",
  panelRight: "M4 4h16v16H4z M14.5 4v16",
  audio: "M4 10v4 M8 7v10 M12 4v16 M16 8v8 M20 10.5v3",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M8 5h3v14H8z M14 5h3v14h-3z",
  send: "M12 19V5 M6 11l6-6 6 6",
  sliders: "M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  smile:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M8 14a5 5 0 0 0 8 0 M9 9h.01 M15 9h.01",
  pin: "M9 3h6l-1 6 4 4H6l4-4z M12 13v8",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  wand: "M4 20 15 9 M14 4v3 M18 6l-2 2 M20 10h-3 M11 6H8 M15 9l-1-1",
  users:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-1a6 6 0 0 1 12 0v1 M16 3.5a4 4 0 0 1 0 7 M22 21v-1a6 6 0 0 0-4-5.6",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4",
  heart:
    "M12 20s-8-5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  graph:
    "M6 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M18.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M11 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M8.4 6.4l7.6.8 M7 8.3l3 7.9 M17.2 9.7l-4.8 6.9",
  minus: "M5 12h14",
  fit: "M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5",
  thumbUp:
    "M7 11v9H4v-9z M7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7",
  thumbDown:
    "M7 13V4H4v9z M7 13l4 7a2 2 0 0 0 2-2v-4h5a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 17 4H7",
  folder:
    "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  tag: "M3 4h8l10 10-7 7L4 11z M7.5 8h.01",
  shuffle: "M16 3h5v5 M4 20 21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5",
  flag: "M5 21V4 M5 4h13l-2.5 4.5L18 13H5",
  help: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9 M12 17h.01",
  gear: "M9 2h6l.5 3 1.5.9 2.5-.8 3 5.2-1.9 1.7v1.8l1.9 1.7-3 5.2-2.5-.8-1.5.9L15 23H9l-.5-2.7-1.5-.9-2.5.8-3-5.2 1.9-1.7v-1.8L1.5 10.3l3-5.2 2.5.8 1.5-.9z M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7",
  keyboard: "M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M8 14h8",
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(svg.namespaceURI, "path");
  p.setAttribute("d", paths[name] || paths.book);
  svg.append(p);
  return svg;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key.startsWith("on"))
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (key === "checked" || key === "disabled" || key === "selected")
      node[key] = value;
    else if (key === "value") node.value = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  }
  return node;
}
const button = (label, action, variant = "", glyph) =>
  el(
    "button",
    { type: "button", class: "button " + variant, onClick: action },
    glyph ? icon(glyph) : null,
    el("span", {}, t(label)),
  );
const iconButton = (name, label, action) =>
  el(
    "button",
    {
      type: "button",
      class: "icon-button",
      title: t(label),
      "aria-label": t(label),
      onClick: action,
    },
    icon(name),
  );
const field = (label, input, hint) => {
  input.setAttribute("aria-label", t(label));
  return el(
    "label",
    {},
    t(label),
    input,
    hint ? el("small", {}, t(hint)) : null,
  );
};
const busy = (label) =>
  el(
    "div",
    { class: "busy-line", role: "status" },
    el("span", { class: "spinner" }),
    t(label),
  );
const formatDate = (value) =>
  new Date(
    value.includes?.(" ") ? value.replace(" ", "T") + "Z" : value,
  ).toLocaleDateString(state.locale, { day: "numeric", month: "short" });
function toast(message, error = false) {
  const n = el("div", { class: "toast" + (error ? " error" : "") }, t(message));
  $("#notifications").append(n);
  setTimeout(() => n.remove(), 6500);
}
async function api(path, { method = "GET", data, signal } = {}) {
  const res = await fetch("/api/" + path, {
    method,
    headers: {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": state.csrf } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Request failed.");
  return result;
}
async function action(fn) {
  try {
    return await fn();
  } catch (error) {
    toast(error.message, true);
    return null;
  }
}
function download(name, data, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function modal(title, body, wide = false) {
  const dialog = $("#dialog");
  if (dialog.open) dialog.close();
  dialog.replaceChildren(
    el(
      "div",
      { class: "dialog-head" },
      el("h2", { id: "dialog-title" }, t(title)),
      iconButton("close", "Close", () => dialog.close()),
    ),
    el("div", { class: "dialog-body" }, body),
  );
  dialog.classList.toggle("wide", wide);
  dialog.showModal();
  return dialog;
}
function confirmAction(title, explanation, callback, label = "Delete") {
  modal(
    title,
    el(
      "div",
      { class: "stack" },
      el("p", {}, explanation),
      el(
        "div",
        { class: "dialog-actions" },
        button("Cancel", () => $("#dialog").close()),
        button(
          label,
          () =>
            action(async () => {
              await callback();
              $("#dialog").close();
            }),
          label === "Delete" ? "danger" : "primary",
          label === "Delete" ? "trash" : "plus",
        ),
      ),
    ),
  );
}
function empty(title, text, control, glyph = "book") {
  return el(
    "div",
    { class: "empty" },
    icon(glyph),
    el("h2", {}, t(title)),
    el("p", {}, t(text)),
    control,
  );
}
function inline(text, citations = []) {
  const nodes = [];
  // ==text== is a key-point highlight the tutor marks for the learner.
  const pattern =
    /(\[\d+\]|==[^=\n]+==|\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\s][^*]*\*(?![\w*])|(?<!\w)_[^_\s][^_]*_(?!\w))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    nodes.push(text.slice(last, match.index));
    const value = match[0];
    if (value.startsWith("[")) {
      const id = Number(value.slice(1, -1)),
        cite = citations.find((c) => c.id === id);
      nodes.push(
        cite
          ? el(
              "button",
              {
                class: "citation",
                type: "button",
                title: cite.title,
                onClick: () => citationModal(cite),
              },
              id,
            )
          : value,
      );
    } else if (value.startsWith("`"))
      nodes.push(el("code", {}, value.slice(1, -1)));
    else if (value.startsWith("=="))
      nodes.push(
        el(
          "mark",
          { class: "key-point" },
          ...inline(value.slice(2, -2), citations),
        ),
      );
    else if (value.startsWith("**"))
      nodes.push(el("strong", {}, ...inline(value.slice(2, -2), citations)));
    else nodes.push(el("em", {}, ...inline(value.slice(1, -1), citations)));
    last = match.index + value.length;
  }
  nodes.push(text.slice(last));
  return nodes;
}
function markdown(text, citations = []) {
  const out = el("div", { class: "prose" });
  let code = null,
    list = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      if (code) {
        out.append(el("pre", {}, el("code", {}, code.join("\n"))));
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      list = null;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    const item = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    const quote = line.match(/^>\s?(.*)/);
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      list = null;
      out.append(el("hr"));
    } else if (item) {
      const tag = /\d/.test(item[1]) ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = el(tag);
        out.append(list);
      }
      list.append(el("li", {}, ...inline(item[2], citations)));
    } else if (quote) {
      list = null;
      out.append(
        el("blockquote", { class: "callout" }, ...inline(quote[1], citations)),
      );
    } else {
      list = null;
      out.append(
        el(
          heading ? (heading[1].length <= 2 ? "h2" : "h3") : "p",
          {},
          ...inline(heading ? heading[2] : line, citations),
        ),
      );
    }
  }
  if (code) out.append(el("pre", {}, code.join("\n")));
  return out;
}
function citationModal(cite) {
  modal(
    cite.title,
    el(
      "div",
      { class: "stack" },
      el(
        "span",
        { class: "badge" },
        `${t(cite.page ? "Page" : "Section")} ${cite.page || cite.section}`,
      ),
      el("div", { class: "source-excerpt" }, cite.text),
      el(
        "p",
        { class: "muted small" },
        "This is the exact excerpt supplied to the model. Verify the answer’s interpretation against it.",
      ),
      button(
        "Open notebook",
        () => {
          $("#dialog").close();
          void sourceModal(cite.sourceId);
        },
        "small",
        "file",
      ),
    ),
  );
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme || "light";
}
function nav(page) {
  location.hash = page;
}
// --- Active AI: one of possibly several connections is "in use" -------------
function activeAi() {
  const c = state.connections.find((c) => c.active);
  return c ? { connectionId: c.id, model: c.activeModel } : null;
}
async function setActiveAi(connectionId, model) {
  await api("ai", {
    method: "PUT",
    data: model ? { connectionId, model } : { connectionId },
  });
  state.connections = await api("connections");
}
const providerName = (id) =>
  state.providers.find((p) => p.id === id)?.name || id;
// --- Notebook access: owner, edit (editable group) or view (shared) ---------
const canEdit = () => state.workspace?.access !== "view";
const isOwner = () => state.workspace?.access === "owner";
/** Mark a control as hidden in view-only notebooks (see body.view-only). */
function editOnly(node) {
  node?.classList?.add("edit-only");
  return node;
}
async function refreshData() {
  const [notebooks, connections, progress, providers, collections, drive] =
    await Promise.all([
      api("notebooks"),
      api("connections"),
      api("progress"),
      api("providers"),
      api("collections"),
      api("drive"),
    ]);
  Object.assign(state, {
    notebooks,
    connections,
    progress,
    providers,
    collections,
    drive,
  });
}
async function openNotebook(id, keep = true) {
  const data = await api("notebooks/" + id);
  const same = state.activeNotebook === id;
  state.workspace = keepUnsavedEffort(data);
  state.activeNotebook = id;
  if (!same || !keep)
    state.selected = new Set(
      data.sources.filter((s) => s.status === "ready").map((s) => s.id),
    );
  else {
    for (const id of [...state.selected])
      if (!data.sources.some((s) => s.id === id && s.status === "ready"))
        state.selected.delete(id);
  }
  state.page = "notebook";
  render();
}
async function route() {
  if (!state.user) return;
  await refreshData();
  const route = location.hash.slice(1) || "dashboard";
  if (route.startsWith("notebook/")) await openNotebook(route.split("/")[1]);
  else {
    [state.page, state.pageId] = route.split("/");
    render();
  }
}
function topbar(filters) {
  const study = [
    ["activity", "Recent activity", "clock"],
    ["sessions", "Study sessions", "cards"],
    ["flashcards", "Flashcards", "cards"],
    ["quizzes", "Quizzes", "quiz"],
    ["progress", "Learning progress", "chart"],
    ["graph", "Knowledge graph", "graph"],
  ];
  const studyButton = menuButton(
    "Study",
    study.map(([page, title, glyph]) => [title, glyph, () => nav(page)]),
    "cards",
  );
  studyButton.append(el("span", {}, t("Study")));
  studyButton.classList.toggle(
    "active",
    study.some(([page]) => page === state.page),
  );
  return el(
    "header",
    { class: "topbar folio-topbar" },
    el(
      "a",
      { href: "#dashboard", class: "brand", "aria-label": t("Folio home") },
      el("span", { class: "brand-mark" }, icon("book")),
      el("span", {}, "folio"),
    ),
    el(
      "nav",
      { class: "folio-nav", "aria-label": t("Main navigation") },
      [
        ["dashboard", "Dashboard"],
        ["notebooks", "My notebooks"],
        ["shared", "Shared with me"],
        ["groups", "Groups", "group"],
        ["communities", "Communities", "community"],
      ].map(([page, label, detail]) =>
        el(
          "a",
          {
            href: "#" + page,
            "aria-current":
              state.page === page || state.page === detail ? "page" : null,
          },
          t(label),
        ),
      ),
      studyButton,
    ),
    filters,
    el(
      "div",
      { class: "top-actions" },
      newUpdateButton("small"),
      button("New notebook", newNotebook, "primary folio-create", "plus"),
      accountControls(),
    ),
  );
}

function avatarContent() {
  const { name, avatarVersion } = state.user;
  return avatarVersion
    ? el("img", {
        src: "/api/me/avatar?v=" + encodeURIComponent(avatarVersion),
        alt: "",
      })
    : Array.from(name)[0]?.toLocaleUpperCase(state.locale) || "F";
}

function accountControls() {
  const account = el(
    "button",
    {
      type: "button",
      class: "gn-avatar",
      "aria-label": t("Account menu"),
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      onClick: () =>
        openMenu(
          account,
          [
            ["Change profile picture", "edit", profilePictureModal],
            state.user.avatarVersion && [
              "Remove profile picture",
              "trash",
              () => saveAvatar(),
            ],
            ["Blocked accounts", "eye", blockedAccountsModal],
            [
              state.user.settings.theme === "dark"
                ? "Light theme"
                : "Dark theme",
              "sun",
              toggleTheme,
            ],
            [
              "Sign out",
              "logout",
              () =>
                action(async () => {
                  await api("auth/logout", { method: "POST", data: {} });
                  location.hash = "";
                  location.reload();
                }),
            ],
          ],
          el(
            "div",
            { class: "folio-account-card", role: "presentation" },
            el(
              "span",
              { class: "gn-avatar", "aria-hidden": "true" },
              avatarContent(),
            ),
            el(
              "div",
              {},
              el("strong", {}, state.user.name),
              el(
                "p",
                { class: "muted small" },
                state.user.email || t("Guest workspace"),
              ),
            ),
          ),
        ),
    },
    avatarContent(),
  );
  const settings = iconButton("gear", "Settings", () => nav("settings"));
  if (state.page === "settings") settings.setAttribute("aria-current", "page");
  const connections = iconButton("plug", "AI connections", () =>
    nav("connections"),
  );
  if (state.page === "connections")
    connections.setAttribute("aria-current", "page");
  return el(
    "div",
    { class: "folio-account-actions" },
    settings,
    connections,
    account,
  );
}

function profilePictureModal() {
  const file = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    required: true,
  });
  const status = el("p", { class: "small", role: "alert" });
  const canvas = el("canvas", {
    width: 256,
    height: 256,
    tabindex: 0,
    "aria-label": t("Crop preview"),
    "aria-describedby": "avatar-crop-help",
  });
  const zoom = el("input", {
    type: "range",
    min: 1,
    max: 4,
    step: 0.1,
    value: 1,
  });
  const context = canvas.getContext("2d");
  let picture, x, y, crop, drag;

  function draw() {
    const { naturalWidth: width, naturalHeight: height } = picture;
    const size = Math.max(
      1,
      Math.round(Math.min(width, height) / zoom.valueAsNumber),
    );
    x = Math.max(size / 2, Math.min(width - size / 2, x));
    y = Math.max(size / 2, Math.min(height - size / 2, y));
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size / 2);
    crop = { left, top, size };
    context.clearRect(0, 0, 256, 256);
    context.drawImage(picture, left, top, size, size, 0, 0, 256, 256);
  }

  function reset() {
    zoom.value = "1";
    x = picture.naturalWidth / 2;
    y = Math.min(picture.naturalWidth, picture.naturalHeight) / 2;
    draw();
  }

  function changeZoom(amount) {
    if (amount > 0) zoom.stepUp();
    else zoom.stepDown();
    draw();
  }

  zoom.addEventListener("input", draw);
  canvas.addEventListener("keydown", (event) => {
    const step = Math.max(1, crop.size / 32);
    switch (event.key) {
      case "ArrowLeft":
        x -= step;
        break;
      case "ArrowRight":
        x += step;
        break;
      case "ArrowUp":
        y -= step;
        break;
      case "ArrowDown":
        y += step;
        break;
      case "+":
        zoom.stepUp();
        break;
      case "-":
        zoom.stepDown();
        break;
      default:
        return;
    }
    event.preventDefault();
    draw();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag) return;
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    drag = event;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const scale = crop.size / canvas.getBoundingClientRect().width;
    x -= (event.clientX - drag.clientX) * scale;
    y -= (event.clientY - drag.clientY) * scale;
    drag = event;
    draw();
  });
  canvas.addEventListener("lostpointercapture", () => {
    drag = null;
  });
  const editor = el(
    "div",
    { class: "avatar-crop", hidden: "" },
    canvas,
    el(
      "p",
      { class: "small", id: "avatar-crop-help" },
      t("Drag the picture or use arrow keys to move. Use + or − to zoom."),
    ),
    field("Zoom", zoom),
    el(
      "div",
      { class: "row" },
      el(
        "button",
        {
          type: "button",
          class: "button small",
          "aria-label": t("Zoom out"),
          onClick: () => changeZoom(-1),
        },
        "−",
      ),
      el(
        "button",
        {
          type: "button",
          class: "button small",
          "aria-label": t("Zoom in"),
          onClick: () => changeZoom(1),
        },
        "+",
      ),
      button("Reset", reset, "small"),
    ),
  );
  const submit = el(
    "button",
    { class: "button primary", type: "submit", disabled: true },
    t("Save"),
  );
  file.addEventListener("change", async () => {
    const image = file.files[0];
    submit.disabled = editor.hidden = true;
    status.textContent = "";
    if (!image) return;
    if (image.size >= 1024 * 1024) {
      status.textContent = t("Choose an image smaller than 1 MB.");
      return;
    }
    const url = URL.createObjectURL(image);
    const preview = new Image();
    try {
      preview.src = url;
      await preview.decode();
      if (file.files[0] !== image) return;
      if (preview.naturalWidth >= 3000 || preview.naturalHeight >= 3000)
        throw new Error();
      picture = preview;
      reset();
      submit.disabled = editor.hidden = false;
    } catch {
      if (file.files[0] === image)
        status.textContent = t(
          "Choose a readable JPEG, PNG or WebP under 3000 by 3000 pixels.",
        );
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: async (event) => {
        event.preventDefault();
        const image = file.files[0];
        if (!image || submit.disabled) return;
        status.textContent = "";
        submit.disabled = true;
        file.disabled = true;
        const selectedCrop = crop;
        try {
          const base64 = new Uint8Array(await image.arrayBuffer()).toBase64();
          await saveAvatar(base64, selectedCrop);
        } catch (error) {
          status.textContent = t(error.message);
        } finally {
          submit.disabled = false;
          file.disabled = false;
        }
      },
    },
    field(
      "Choose a picture",
      file,
      "Use a JPEG, PNG or WebP under 3000 by 3000 pixels and 1 MB.",
    ),
    editor,
    status,
    submit,
  );
  modal("Change profile picture", form);
}

async function saveAvatar(base64, crop) {
  const result = base64
    ? await api("me/avatar", { method: "PUT", data: { base64, crop } })
    : await action(() => api("me/avatar", { method: "DELETE" }));
  if (!result) return;
  state.user.avatarVersion = result.avatarVersion;
  if ($("#dialog").open) $("#dialog").close();
  render();
  toast(base64 ? "Profile picture saved." : "Profile picture removed.");
}

function blockAccount(id, reload) {
  return confirmAction(
    "Block account",
    t(
      "This hides their notebooks and prevents direct shares and group invitations between you.",
    ),
    async () => {
      await api("blocks/" + id, { method: "PUT", data: {} });
      toast("Account blocked.");
      reload();
    },
    "Block",
  );
}

function blockedAccountsModal() {
  const list = el("div", { class: "stack" });
  const draw = async () => {
    const blocks = await api("blocks");
    list.replaceChildren(
      ...(blocks.length
        ? blocks.map(({ id, name }) =>
            el(
              "div",
              { class: "row between" },
              el("span", {}, name),
              button(
                "Unblock",
                () =>
                  action(async () => {
                    await api("blocks/" + id, { method: "DELETE" });
                    await draw();
                    toast("Account unblocked.");
                  }),
                "small",
              ),
            ),
          )
        : [el("p", { class: "muted" }, t("No blocked accounts."))]),
    );
  };
  modal("Blocked accounts", list);
  void action(draw);
}

function heading(title, subtitle, control) {
  return el(
    "div",
    { class: "page-heading" },
    el(
      "div",
      {},
      el("h1", {}, t(title)),
      subtitle ? el("p", {}, t(subtitle)) : null,
    ),
    control,
  );
}
function pageView() {
  switch (state.page) {
    case "notebooks":
      return notebooksView();
    case "connections":
      return connectionsView();
    case "settings":
      return settingsView();
    case "progress":
      return progressView();
    case "graph":
      return graphView();
    case "shared":
      return sharedView();
    case "groups":
      return groupsView();
    case "group":
      return groupView(state.pageId);
    case "communities":
      return communitiesView();
    case "community":
      return communityView(state.pageId);
    case "activity":
      return activityView();
    case "flashcards":
    case "quizzes":
    case "sessions":
      return libraryView();
    default:
      return dashboard();
  }
}
function metrics(p) {
  return el(
    "div",
    { class: "metrics" },
    [
      [p.due, "Cards due"],
      [p.reviews, "Cards reviewed"],
      [p.attempts.length, "Quizzes completed"],
    ].map(([value, label]) =>
      el(
        "div",
        { class: "metric" },
        el("strong", {}, value),
        el("span", {}, t(label)),
      ),
    ),
  );
}
function renderAuth(register = false) {
  const error = el("div", { class: "notice error hidden", role: "alert" }),
    name = el("input", {
      autocomplete: "name",
      maxlength: 200,
      required: true,
    }),
    email = el("input", {
      type: "email",
      autocomplete: "email",
      required: true,
      maxlength: 254,
    }),
    password = el("input", {
      type: "password",
      autocomplete: register ? "new-password" : "current-password",
      required: true,
      minlength: 12,
      maxlength: 128,
    });
  const submit = el(
    "button",
    { class: "button primary full", type: "submit" },
    t(register ? "Create account" : "Sign in"),
  );
  const authenticate = async (path, data) => {
    error.classList.add("hidden");
    submit.disabled = true;
    try {
      const result = await api("auth/" + path, { method: "POST", data });
      state.user = result.user;
      state.csrf = result.csrf;
      await route();
    } catch (e) {
      error.textContent = e.message;
      error.classList.remove("hidden");
    } finally {
      submit.disabled = false;
    }
  };
  const form = el(
    "form",
    {
      onSubmit: (e) => {
        e.preventDefault();
        void authenticate(register ? "register" : "login", {
          email: email.value,
          password: password.value,
          ...(register ? { name: name.value } : {}),
        });
      },
    },
    register ? field("Name", name) : null,
    field("Email", email),
    field(
      "Password",
      password,
      register ? "Use a unique password of at least 12 characters." : null,
    ),
    error,
    submit,
  );
  const story = el(
    "section",
    { class: "auth-story" },
    el(
      "a",
      { href: "#", class: "brand" },
      el("span", { class: "brand-mark" }, icon("book")),
      el("span", {}, "folio"),
    ),
    el("h1", {}, t("A place to understand.")),
    el(
      "p",
      {},
      "Bring your sources. Choose your AI. Turn what you’re reading into knowledge that stays with you.",
    ),
    el(
      "div",
      { class: "row" },
      icon("file"),
      el(
        "span",
        { class: "small" },
        "Your materials, with the context intact.",
      ),
    ),
  );
  const locale = el(
    "select",
    {
      "aria-label": "Language",
      onChange: (e) => {
        state.locale = e.target.value;
        localStorage.setItem("folio-locale", state.locale);
        renderAuth(register);
      },
    },
    el("option", { value: "en", selected: state.locale === "en" }, "English"),
    el(
      "option",
      { value: "pt-BR", selected: state.locale === "pt-BR" },
      "Português (Brasil)",
    ),
  );
  $("#app").replaceChildren(
    el(
      "div",
      { class: "auth" },
      story,
      el(
        "section",
        { class: "auth-form" },
        el(
          "div",
          {},
          el(
            "div",
            { class: "row between" },
            el("h2", {}, t(register ? "Create your account" : "Welcome back")),
            locale,
          ),
          el("p", { class: "muted small" }, t("Sign in to Folio")),
          form,
          button(
            "Continue as guest",
            () => void authenticate("guest", {}),
            "full",
          ),
          el(
            "p",
            { class: "muted small section-space" },
            t(register ? "Already have an account?" : "New here?"),
            " ",
            el(
              "button",
              {
                class: "button quiet small",
                onClick: () => renderAuth(!register),
              },
              t(register ? "Sign in" : "Create a free account"),
            ),
          ),
          el(
            "p",
            { class: "muted small" },
            t(
              "Data is saved on this server. Guest access depends on this browser session.",
            ),
          ),
        ),
      ),
    ),
  );
}
function driveConnection() {
  const status = el("p", { class: "small muted", role: "status" });
  const controls = el("div", { class: "row wrap" });
  const update = () => {
    status.textContent = t(state.drive.connected ? "Google Drive connected." : "Google Drive disconnected.");
    controls.replaceChildren(
      state.drive.connected
        ? button("Disconnect Google Drive", () => action(async () => {
            const { revoked } = await api("drive", { method: "DELETE" });
            state.drive = await api("drive");
            update();
            if (!revoked) toast("Disconnected in Folio. Remove access in your Google Account to revoke the token.", true);
          }))
        : button("Connect Google Drive", (event) => action(async () => {
            const start = event.currentTarget;
            start.disabled = true;
            try {
              const { url } = await api("drive/start", { method: "POST" });
              status.textContent = t("Complete Google sign-in in your browser, then select Check connection.");
              controls.append(el("a", {
                href: url, target: "_blank", rel: "noopener noreferrer", class: "button primary",
              }, t("Open Google sign-in")));
            } catch (error) {
              start.disabled = false;
              throw error;
            }
          })),
      button("Check connection", () => action(async () => {
        state.drive = await api("drive");
        update();
      })),
    );
  };
  if (state.drive.enabled) update();
  else status.textContent = t("Google Drive requires a local Folio installation configured with a Google OAuth desktop client.");
  return el("section", { class: "panel stack" }, el("h2", {}, t("Google Drive")), status, controls);
}

function connectionsView() {
  const provider = el(
    "select",
    { name: "provider" },
    state.providers
      .filter((p) => p.available)
      .map((p) => el("option", { value: p.id }, p.name)),
  );
  const label = el("input", {
      required: true,
      maxlength: 200,
      placeholder: "My study connection",
    }),
    key = el("input", {
      type: "password",
      autocomplete: "off",
      maxlength: 2000,
      placeholder: "Official API key",
    }),
    status = el("div"),
    submit = el(
      "button",
      { class: "button primary", type: "submit" },
      t("Connect"),
    );
  const help = el(
    "a",
    { target: "_blank", rel: "noopener noreferrer", class: "small" },
    "Get an official API key",
  );
  // One button for every provider: a CLI opens its own sign-in page, OpenRouter
  // authorizes, and the rest open the page where the key is made.
  const signIn = button(
    "Sign in",
    () =>
      action(async () => {
        const p = state.providers.find((p) => p.id === provider.value);
        if (p.signin === "key")
          return void window.open(p.docs, "_blank", "noopener");
        if (p.signin === "oauth") {
          const result = await api("oauth/openrouter/start", {
            method: "POST",
            data: {},
          });
          return void location.assign(result.url);
        }
        await api(`providers/${p.id}/signin`, { method: "POST", data: {} });
        toast("Finish signing in in your browser, then choose Connect.");
      }),
    "",
    "plug",
  );
  const update = () => {
    const p = state.providers.find((p) => p.id === provider.value);
    help.href = p.docs;
    const noKey = Boolean(p?.keyless);
    key.required = !noKey;
    key.disabled = noKey;
    key.placeholder =
      p?.signin === "cli"
        ? "No key needed: use Sign in"
        : provider.value === "ollama"
          ? "No key needed for local Ollama"
          : "Official API key";
    help.textContent =
      provider.value === "codex"
        ? "Uses the ChatGPT account signed in to Codex CLI on this computer. Plan usage limits apply."
        : provider.value === "claude"
          ? "Uses the Claude account signed in to Claude Code on this computer. Plan usage limits apply."
          : provider.value === "ollama"
          ? "Install the free Ollama app, keep it running, then connect. You can download models from Folio afterwards."
          : "Get an official API key";
  };
  provider.addEventListener("change", update);
  update();
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        submit.disabled = true;
        status.replaceChildren(busy("Working…"));
        void action(async () => {
          await api("connections", {
            method: "POST",
            data: {
              provider: provider.value,
              label: label.value,
              key: key.disabled ? "" : key.value,
            },
          });
          key.value = "";
          await refreshData();
          render();
          toast("Saved.");
        }).finally(() => {
          submit.disabled = false;
          status.replaceChildren();
        });
      },
    },
    el(
      "div",
      { class: "form-grid" },
      el(
        "div",
        { class: "row provider-pick" },
        field("Provider", provider),
        signIn,
      ),
      field("Connection name", label),
      el("div", { class: "span" }, field("API key", key)),
    ),
    help,
    el(
      "p",
      { class: "muted small" },
      t(
        "Your provider password is never requested. API billing may be separate from chat subscriptions.",
      ),
    ),
    status,
    el(
      "div",
      { class: "row wrap" },
      submit,
    ),
  );
  return el(
    "div",
    { class: "stack" },
    heading(
      "AI connections",
      "Your material is sent only to the provider you select.",
    ),
    el(
      "p",
      { class: "notice" },
      t(
        "You can connect several AIs at once (for example Claude and GPT). The one marked In use answers in every notebook; switch here or in Settings.",
      ),
    ),
    el(
      "div",
      { class: "panel" },
      el("h2", {}, t("Connect a provider")),
      el("div", { class: "section-space" }, form),
    ),
    driveConnection(),
    el("h2", {}, t("Connected providers")),
    state.connections.length
      ? el(
          "div",
          { class: "stack" },
          state.connections.map((c) => {
            const details = el(
              "details",
              {},
              el(
                "summary",
                {},
                `${c.models.length} ${t("Models").toLowerCase()}`,
              ),
              el(
                "ul",
                { class: "connection-models" },
                c.models.map((m) =>
                  el(
                    "li",
                    {},
                    `${m.name} — ${m.id}${m.context ? " / " + m.context + " context tokens" : ""}${m.capabilities.embeddings ? " / embeddings" : ""}${m.pricing ? " / pricing available from provider" : " / cost unknown"}`,
                  ),
                ),
              ),
            );
            const library =
              state.providers.find((p) => p.id === c.provider)?.library || [];
            const pick = el(
              "select",
              { "aria-label": t("Ollama model") },
              library
                .filter((m) => !c.models.some((x) => x.id === m.id))
                .map((m) => el("option", { value: m.id }, `${m.name} (${m.id})`)),
            );
            const pull = library.length
              ? el(
                  "div",
                  { class: "row wrap" },
                  pick,
                  button(
                    "Download model",
                    (e) =>
                      action(async () => {
                        e.currentTarget.disabled = true;
                        toast(t("Downloading… large models can take several minutes."));
                        await api("connections/" + c.id + "/pull", {
                          method: "POST",
                          data: { model: pick.value },
                        });
                        await refreshData();
                        render();
                        toast(t("Model ready."));
                      }),
                    "small",
                    "download",
                  ),
                )
              : null;
            return el(
              "div",
              { class: "panel stack" },
              el(
                "div",
                { class: "row between wrap" },
                el(
                  "div",
                  {},
                  el("h3", {}, c.label),
                  el(
                    "span",
                    { class: "badge" },
                    state.providers.find((p) => p.id === c.provider)?.name,
                  ),
                  c.active
                    ? el(
                        "span",
                        { class: "chip access-owner" },
                        icon("check"),
                        t("In use"),
                      )
                    : null,
                ),
                el(
                  "div",
                  { class: "row" },
                  c.active || !c.models.some((m) => m.capabilities.text)
                    ? null
                    : button(
                        "Use this AI",
                        () =>
                          action(async () => {
                            await setActiveAi(c.id);
                            render();
                            toast(t("Now using") + " " + c.label);
                          }),
                        "small primary",
                      ),
                  button(
                    "Refresh models",
                    () =>
                      action(async () => {
                        await api("connections/" + c.id + "/models", {
                          method: "POST",
                          data: {},
                        });
                        await refreshData();
                        render();
                      }),
                    "small",
                  ),
                  button(
                    "Disconnect",
                    () =>
                      confirmAction(
                        "Disconnect",
                        "Delete this stored connection? Revoke the API key in the provider console to invalidate it there.",
                        async () => {
                          await api("connections/" + c.id, {
                            method: "DELETE",
                          });
                          await refreshData();
                          render();
                          toast("Connection removed.");
                        },
                      ),
                    "small danger",
                  ),
                ),
              ),
              details,
              pull,
            );
          }),
        )
      : el("p", { class: "muted" }, t("No provider connected.")),
    el(
      "div",
      { class: "notice" },
      "Connections are validated through live provider requests. Model discovery does not guarantee inference quota or access to every model. Unknown capabilities stay unknown; this release uses text generation and optional embeddings.",
    ),
  );
}
function modelSelect(onChange, selected = activeAi() || {}) {
  const select = el("select", {
    "aria-label": t("Choose a model"),
    onChange: () => {
      const [connectionId, model] = JSON.parse(select.value);
      onChange(connectionId, model);
    },
  });
  select.append(
    el(
      "option",
      { value: "", disabled: true, selected: !selected.connectionId },
      t("Choose a model"),
    ),
  );
  for (const c of state.connections) {
    const group = el("optgroup", { label: c.label });
    for (const m of c.models.filter((m) => m.capabilities.text))
      group.append(
        el(
          "option",
          {
            value: JSON.stringify([c.id, m.id]),
            selected: c.id === selected.connectionId && m.id === selected.model,
          },
          m.name,
        ),
      );
    select.append(group);
  }
  return select;
}
/** Choosing a model anywhere switches the AI in use for every notebook. */
async function saveModel(connectionId, model) {
  await setActiveAi(connectionId, model);
}
// Reasoning effort: Auto plus five levels on a slider.
// Level names carry their own Portuguese: "Light" already means the theme.
const effortLevels = [
  ["light", ["Light", "Leve"], "Quick answers, fewest tokens"],
  ["medium", ["Medium", "Médio"], "Balanced depth and cost"],
  ["high", ["High", "Alto"], "Deeper reasoning"],
  ["extra", ["Extra", "Extra"], "Very thorough, slower"],
  ["ultra", ["Ultra", "Ultra"], "Maximum reasoning, most tokens"],
];
const recommendedEffort = 1;
const inLocale = ([en, pt]) => (state.locale === "pt-BR" ? pt : en);
// Folio 0.3 saved "low"; it is Light now.
const effortIndex = (value) =>
  effortLevels.findIndex(([v]) => v === (value === "low" ? "light" : value));
/** Short name for the composer chip; the card adds "(Recommended)" to Medium. */
const effortShort = (value) => {
  const i = effortIndex(value);
  return i < 0 ? inLocale(["Auto", "Automático"]) : inLocale(effortLevels[i][1]);
};
const effortName = (value) =>
  effortShort(value) +
  (effortIndex(value) === recommendedEffort
    ? inLocale([" (Recommended)", " (Recomendado)"])
    : "");
/** The effort card: Auto toggle, level name, model, reset and a five-stop slider. */
function effortCard(selected, onChange, model) {
  let value = effortIndex(selected) < 0 ? "auto" : effortLevels[effortIndex(selected)][0];
  const title = el("strong", { class: "effort-title" });
  const detail = el("span", { class: "effort-detail" });
  const hint = el("p", { class: "effort-hint" });
  const range = el("input", {
    type: "range",
    min: 0,
    max: effortLevels.length - 1,
    step: 1,
    class: "effort-range",
    "aria-label": t("Reasoning effort"),
  });
  const dots = el(
    "div",
    { class: "effort-dots", "aria-hidden": "true" },
    effortLevels.map(() => el("span")),
  );
  const track = el(
    "div",
    { class: "effort-track" },
    el("div", { class: "effort-fill" }),
    dots,
    range,
  );
  const auto = el(
    "button",
    {
      type: "button",
      class: "effort-auto",
      title: t("Let Folio choose"),
      "aria-label": t("Let Folio choose"),
      onClick: () => set(value === "auto" ? effortLevels[recommendedEffort][0] : "auto"),
    },
    icon("bolt"),
  );
  const reset = el(
    "button",
    {
      type: "button",
      class: "effort-reset",
      title: t("Reset to recommended"),
      "aria-label": t("Reset to recommended"),
      onClick: () => set(effortLevels[recommendedEffort][0]),
    },
    icon("refresh"),
  );
  const card = el(
    "div",
    { class: "effort-card" },
    el(
      "div",
      { class: "effort-head" },
      auto,
      el("div", { class: "effort-label" }, title, detail),
      reset,
    ),
    track,
    hint,
  );
  const paint = () => {
    const i = effortIndex(value),
      shown = i < 0 ? recommendedEffort : i;
    range.value = String(shown);
    range.setAttribute("aria-valuetext", effortName(value));
    card.style.setProperty("--effort", String(shown / (effortLevels.length - 1)));
    card.dataset.level = value;
    [...dots.children].forEach((dot, k) => dot.classList.toggle("on", k <= shown));
    auto.setAttribute("aria-pressed", String(value === "auto"));
    title.textContent = effortName(value);
    detail.textContent = model || "";
    detail.hidden = !model;
    hint.textContent =
      t(i < 0 ? "Folio picks the effort for each task" : effortLevels[i][2]) +
      " · " +
      t("Applies to reasoning models; others ignore it.");
  };
  const set = (next) => {
    if (next === value) return;
    value = next;
    paint();
    onChange(value);
  };
  // Dragging repaints; the choice is saved once the thumb is released.
  range.addEventListener("input", () => {
    value = effortLevels[Number(range.value)][0];
    paint();
  });
  range.addEventListener("change", () => onChange(value));
  paint();
  return card;
}
/** Composer chip that opens the effort card above it. */
function effortControl(selected, onChange, model) {
  const label = el("span");
  const chip = el(
    "button",
    {
      type: "button",
      class: "effort-chip",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      onClick: () => (pop.hidden ? open() : close()),
    },
    icon("bolt"),
    label,
  );
  const show = (value) => {
    label.textContent = effortShort(value);
    chip.setAttribute("aria-label", t("Effort") + ": " + effortShort(value));
  };
  const pop = el(
    "div",
    { class: "effort-pop", hidden: true },
    effortCard(
      selected,
      (value) => {
        show(value);
        onChange(value);
      },
      model,
    ),
  );
  const wrap = el("div", { class: "effort-control" }, chip, pop);
  const outside = (e) => {
    if (!wrap.contains(e.target)) close();
  };
  const escape = (e) => {
    if (e.key === "Escape") {
      close();
      chip.focus();
    }
  };
  function open() {
    pop.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    pop.querySelector(".effort-range").focus();
  }
  function close() {
    pop.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("keydown", escape);
  }
  show(selected);
  return wrap;
}
// Effort levels whose save the server has not answered yet, by notebook.
const unsavedEffort = new Map();
/** A workspace loaded while an effort save is in flight keeps the level being saved. */
const keepUnsavedEffort = (data) => {
  const effort = unsavedEffort.get(data.notebook.id);
  if (effort) data.notebook.settings.effort = effort;
  return data;
};
async function saveEffort(effort, notebookId = state.activeNotebook) {
  // Applied at once, so a message sent before the server answers uses the
  // level just chosen; put back if the save fails.
  const current = () =>
      state.activeNotebook === notebookId
        ? state.workspace.notebook.settings
        : null,
    previous = current()?.effort;
  if (current()) current().effort = effort;
  unsavedEffort.set(notebookId, effort);
  try {
    await api("notebooks/" + notebookId, {
      method: "PATCH",
      data: { settings: { effort } },
    });
  } catch (error) {
    if (current()?.effort === effort) current().effort = previous;
    throw error;
  } finally {
    if (unsavedEffort.get(notebookId) === effort)
      unsavedEffort.delete(notebookId);
  }
}
// ---------------------------------------------------------------------------
// Notebook workspace (three-panel layout modelled on Gemini Notebook)
// ---------------------------------------------------------------------------
const emojiChoices = [
  "📘",
  "🧪",
  "🧬",
  "🌍",
  "🧠",
  "📈",
  "⚛️",
  "🏛️",
  "🎨",
  "💡",
  "🩺",
  "🧮",
  "📜",
  "🔭",
  "🌱",
  "🎧",
];
const tintNames = ["lavender", "sky", "mint", "peach", "rose", "sand"];
function hashString(value) {
  let h = 7;
  for (const ch of String(value)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}
const notebookEmoji = (n) =>
  n.settings?.emoji || emojiChoices[hashString(n.id) % emojiChoices.length];
const notebookTint = (n) => tintNames[hashString(n.id + "tint") % 6];
const parseTime = (value) =>
  new Date(
    value?.includes?.(" ") ? value.replace(" ", "T") + "Z" : value,
  ).getTime();
const plural = (count, one, many) => `${count} ${t(count === 1 ? one : many)}`;
function relativeTime(value) {
  const seconds = (parseTime(value) - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  const rtf = new Intl.RelativeTimeFormat(state.locale, { numeric: "auto" });
  for (const [unit, size] of [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ])
    if (Math.abs(seconds) >= size)
      return rtf.format(Math.round(seconds / size), unit);
  return t("Just now");
}
function stored(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional. */
  }
}
let menuController;
function closeMenus() {
  menuController?.abort();
  document.querySelectorAll(".gn-menu").forEach((m) => m.remove());
  document
    .querySelectorAll("[aria-haspopup=menu][aria-expanded=true]")
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
}
function openMenu(anchor, items, heading = null) {
  const alreadyOpen = anchor.getAttribute("aria-expanded") === "true";
  closeMenus();
  if (alreadyOpen) return;
  const entries = items.filter(Boolean);
  const menuEl = el(
    "div",
    {
      class: "gn-menu",
      role: "menu",
      "aria-label": anchor.getAttribute("aria-label"),
    },
    heading,
    entries.map(([label, glyph, fn, danger]) =>
      el(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: "gn-menu-item" + (danger ? " danger" : ""),
          onClick: () => {
            closeMenus();
            anchor.focus();
            fn();
          },
        },
        icon(glyph),
        el("span", {}, t(label)),
      ),
    ),
  );
  document.body.append(menuEl);
  const r = anchor.getBoundingClientRect();
  const w = menuEl.offsetWidth,
    h = menuEl.offsetHeight;
  menuEl.style.left =
    Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  menuEl.style.top =
    (r.bottom + h + 8 > innerHeight
      ? Math.max(8, r.top - h - 4)
      : r.bottom + 4) + "px";
  anchor.setAttribute("aria-expanded", "true");
  const buttons = [...menuEl.querySelectorAll("button")];
  buttons[0]?.focus();
  menuEl.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length;
      buttons[next].focus();
    }
  });
  const dismiss = (e) => {
    if (e.type === "keydown" && e.key !== "Escape" && e.key !== "Tab") return;
    if (
      e.type === "pointerdown" &&
      (menuEl.contains(e.target) || anchor.contains(e.target))
    )
      return;
    closeMenus();
    if (e.type === "keydown" && e.key === "Escape") anchor.focus();
  };
  menuController = new AbortController();
  const listeners = { capture: true, signal: menuController.signal };
  document.addEventListener("pointerdown", dismiss, listeners);
  document.addEventListener("keydown", dismiss, listeners);
}
function menuButton(label, items, glyph = "more") {
  const b = iconButton(glyph, label, (e) => {
    e.stopPropagation();
    openMenu(b, typeof items === "function" ? items() : items);
  });
  b.setAttribute("aria-haspopup", "menu");
  b.setAttribute("aria-expanded", "false");
  b.classList.add("gn-more");
  return b;
}
function renameModal(title, current, save) {
  const input = el("input", { required: true, maxlength: 200, value: current });
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          await save(input.value.trim());
          $("#dialog").close();
          toast("Saved.");
        });
      },
    },
    field("Title", input),
    el(
      "div",
      { class: "dialog-actions" },
      button("Cancel", () => $("#dialog").close()),
      el("button", { class: "button primary", type: "submit" }, t("Save")),
    ),
  );
  modal(title, form);
  input.select();
}
function emojiPicker(current) {
  let value = current;
  const node = el(
    "div",
    { class: "gn-emoji-grid", role: "radiogroup", "aria-label": t("Icon") },
    emojiChoices.map((emoji) =>
      el(
        "button",
        {
          type: "button",
          role: "radio",
          class: "gn-emoji",
          "aria-checked": String(emoji === value),
          "aria-label": emoji,
          onClick: (event) => {
            value = emoji;
            node
              .querySelectorAll(".gn-emoji")
              .forEach((b) =>
                b.setAttribute(
                  "aria-checked",
                  String(b === event.currentTarget),
                ),
              );
          },
        },
        emoji,
      ),
    ),
  );
  return {
    node,
    get value() {
      return value;
    },
  };
}
async function afterNotebookChange(id) {
  await refreshData();
  if (state.page === "notebook" && state.activeNotebook === id)
    await openNotebook(id);
  else render();
}
function iconModal(n) {
  const picker = emojiPicker(notebookEmoji(n));
  modal(
    "Change icon",
    el(
      "div",
      { class: "stack" },
      picker.node,
      el(
        "div",
        { class: "dialog-actions" },
        button("Cancel", () => $("#dialog").close()),
        button(
          "Save",
          () =>
            action(async () => {
              await api("notebooks/" + n.id, {
                method: "PATCH",
                data: { settings: { emoji: picker.value } },
              });
              $("#dialog").close();
              await afterNotebookChange(n.id);
            }),
          "primary",
        ),
      ),
    ),
  );
}
function notebookMenu(n) {
  return [
    [
      "Rename",
      "edit",
      () =>
        renameModal("Rename notebook", n.title, async (title) => {
          await api("notebooks/" + n.id, { method: "PATCH", data: { title } });
          await afterNotebookChange(n.id);
        }),
    ],
    ["Change icon", "smile", () => iconModal(n)],
    ["Graph view", "graph", () => nav("graph/" + n.id)],
    ["Add to a collection", "folder", () => collectionModal(n)],
    ["Share with a person", "share", () => shareModal(n)],
    ["Add to a group", "users", () => addToGroupModal(n)],
    ["Publish to a community", "globe", () => publishModal(n)],
    [
      "Delete notebook",
      "trash",
      () =>
        confirmAction(
          "Delete notebook",
          "Permanently remove this notebook, sources, resources and study history from the active database?",
          async () => {
            await api("notebooks/" + n.id, { method: "DELETE" });
            await refreshData();
            if (state.page === "notebook") nav("notebooks");
            else render();
          },
        ),
      true,
    ],
  ];
}
function toggleTheme() {
  return action(async () => {
    const theme = state.user.settings.theme === "dark" ? "light" : "dark";
    await api("me", { method: "PATCH", data: { theme } });
    state.user.settings.theme = theme;
    setTheme(theme);
  });
}
function render() {
  document.documentElement.lang = state.locale;
  setTheme(state.user?.settings?.theme);
  closeMenus();
  document.body.classList.toggle(
    "view-only",
    state.page === "notebook" && state.workspace?.access === "view",
  );
  if (!state.user) return renderAuth();
  if (state.page === "notebook" && state.workspace) {
    const scroll = $("#chat-scroll");
    const keepScroll =
      scroll &&
      state.lastRendered === state.activeNotebook &&
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 40
        ? scroll.scrollTop
        : null;
    $("#app").replaceChildren(workspaceView());
    state.lastRendered = state.activeNotebook;
    syncSelection();
    const next = $("#chat-scroll");
    if (next) next.scrollTop = keepScroll ?? (next.scrollHeight > 0 ? 1e9 : 0);
    return;
  }
  state.lastRendered = null;
  const main = el(
    "main",
    { id: "main", tabindex: "-1", class: "main-area" },
    el("div", { class: "content" }, pageView()),
  );
  $("#app").replaceChildren(el("div", { class: "folio-shell" }, topbar(main.querySelector(".gn-gallery-tools")), main));
}
// --- Home -------------------------------------------------------------------
function notebookCard(n) {
  return el(
    "article",
    { class: "gn-nb-card tint-" + notebookTint(n) },
    el(
      "button",
      {
        type: "button",
        class: "gn-nb-open",
        onClick: () => nav("notebook/" + n.id),
      },
      el(
        "span",
        { class: "gn-nb-emoji", "aria-hidden": "true" },
        notebookEmoji(n),
      ),
      el("strong", { class: "gn-nb-title" }, n.title),
      el(
        "span",
        { class: "gn-nb-meta" },
        `${formatDate(n.updated)} · ${plural(n.sourceCount, "source", "sources")}`,
      ),
    ),
    menuButton("Notebook options", notebookMenu(n)),
  );
}
function notebookListRow(n) {
  return el(
    "div",
    { class: "gn-nb-row", role: "listitem" },
    el(
      "button",
      {
        type: "button",
        class: "gn-nb-open",
        onClick: () => nav("notebook/" + n.id),
      },
      el(
        "span",
        { class: "gn-nb-emoji", "aria-hidden": "true" },
        notebookEmoji(n),
      ),
      el(
        "span",
        { class: "gn-nb-row-text" },
        el("strong", {}, n.title),
        n.description ? el("small", {}, n.description.slice(0, 120)) : null,
      ),
    ),
    el(
      "span",
      { class: "gn-nb-row-meta" },
      plural(n.sourceCount, "source", "sources"),
    ),
    el("span", { class: "gn-nb-row-meta" }, formatDate(n.updated)),
    menuButton("Notebook options", notebookMenu(n)),
  );
}
function notebookGallery(notebooks, { search = false, limit = 0 } = {}) {
  let view = stored("folio-nb-view", "grid"),
    sort = stored("folio-nb-sort", "recent"),
    query = "";
  const body = el("div", { class: "gn-gallery-body" });
  const draw = () => {
    let items = notebooks.filter((n) =>
      (n.title + " " + n.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    items = [...items].sort(
      sort === "title"
        ? (a, b) => a.title.localeCompare(b.title, state.locale)
        : sort === "sources"
          ? (a, b) => b.sourceCount - a.sourceCount
          : (a, b) => parseTime(b.updated) - parseTime(a.updated),
    );
    if (limit) items = items.slice(0, limit);
    body.replaceChildren(
      view === "list"
        ? el(
            "div",
            { class: "gn-nb-list", role: "list" },
            items.map(notebookListRow),
          )
        : el(
            "div",
            { class: "gn-nb-grid" },
            el(
              "button",
              {
                type: "button",
                class: "gn-nb-card gn-nb-new",
                onClick: newNotebook,
              },
              el(
                "span",
                { class: "gn-new-plus", "aria-hidden": "true" },
                icon("plus"),
              ),
              el("strong", {}, t("Create new notebook")),
            ),
            items.map(notebookCard),
          ),
    );
    if (!items.length && query)
      body.append(el("p", { class: "muted" }, t("No matching notebooks.")));
    if (view === "list")
      body.prepend(
        button("Create new notebook", newNotebook, "gn-pill", "plus"),
      );
  };
  const sortSelect = el(
    "select",
    {
      "aria-label": t("Sort notebooks"),
      onChange: (e) => {
        sort = e.target.value;
        store("folio-nb-sort", sort);
        draw();
      },
    },
    [
      ["recent", "Most recent"],
      ["title", "Title"],
      ["sources", "Most sources"],
    ].map(([value, label]) =>
      el("option", { value, selected: value === sort }, t(label)),
    ),
  );
  const viewButtons = [
    ["grid", "grid", "Grid view"],
    ["list", "list", "List view"],
  ].map(([value, glyph, label]) => {
    const b = iconButton(glyph, label, () => {
      view = value;
      store("folio-nb-view", view);
      viewButtons.forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b)),
      );
      draw();
    });
    b.setAttribute("aria-pressed", String(view === value));
    return b;
  });
  draw();
  return el(
    "div",
    { class: "gn-gallery" },
    el(
      "div",
      { class: "gn-gallery-tools" },
      search
        ? el(
            "label",
            { class: "gn-search grow" },
            icon("search"),
            el("input", {
              type: "search",
              placeholder: t("Search notebooks"),
              "aria-label": t("Search notebooks"),
              onInput: (e) => {
                query = e.target.value;
                draw();
              },
            }),
          )
        : el("span", { class: "grow" }),
      el(
        "div",
        { class: "gn-segmented", role: "group", "aria-label": t("View") },
        viewButtons,
      ),
    ),
    el("div", { class: "gn-gallery-sort" }, sortSelect),
    body,
  );
}
function dashboard() {
  const p = state.progress;
  return el(
    "div",
    { class: "gn-home" },
    el(
      "section",
      { class: "gn-home-hero" },
      el(
        "div",
        {},
        el("h1", {}, t("A little clarity, every day.")),
        el("p", {}, t("Import notes, a chapter, or a worksheet to begin.")),
      ),

    ),
    !state.connections.length
      ? el(
          "div",
          { class: "notice" },
          el("strong", {}, t("No provider connected.")),
          el(
            "p",
            {},
            t("Connect an authorized provider to generate study resources."),
          ),
          button("Connect a provider", () => nav("connections"), "small"),
        )
      : null,
    el(
      "div",
      { class: "gn-section-head" },
      el("h2", {}, t("Recent notebooks")),
      button("View all", () => nav("notebooks"), "quiet small"),
    ),
    notebookGallery(state.notebooks, { search: true, limit: 11 }),
    el("div", { class: "gn-section-head" }, el("h2", {}, t("Your study"))),
    metrics(p),
    el(
      "div",
      { class: "panel section-space" },
      p.due
        ? el(
            "div",
            { class: "row between" },
            el(
              "div",
              {},
              el("h3", {}, `${p.due} ${t("Cards due").toLowerCase()}`),
              el(
                "p",
                { class: "muted small" },
                "Retrieve first. Reveal, reflect, then schedule your next review.",
              ),
            ),
            button("Flashcards", () => nav("flashcards"), "small", "cards"),
          )
        : el("p", { class: "muted" }, t("No cards are due.")),
    ),
  );
}
/** The collection being browsed, or undefined for all notebooks. */
const activeCollection = () =>
  (state.collections || []).find((c) => c.id === state.collection);
function collectionNotebooks() {
  const collection = activeCollection();
  return collection
    ? state.notebooks.filter((n) => collection.notebookIds.includes(n.id))
    : state.notebooks;
}
function collectionNameModal(title, current, save) {
  const input = el("input", { required: true, maxlength: 80, value: current });
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          await save(input.value.trim());
          $("#dialog").close();
          await refreshData();
          render();
          toast("Saved.");
        });
      },
    },
    field("Collection name", input),
    el(
      "div",
      { class: "dialog-actions" },
      button("Cancel", () => $("#dialog").close()),
      el("button", { class: "button primary", type: "submit" }, t("Save")),
    ),
  );
  modal(title, form);
  input.select();
}
const newCollection = (then) =>
  collectionNameModal("New collection", "", async (name) => {
    const { id } = await api("collections", { method: "POST", data: { name } });
    if (then) await then(id);
    else state.collection = id;
  });
function collectionBar() {
  const collection = activeCollection();
  const chip = (label, id, count) =>
    el(
      "button",
      {
        type: "button",
        class: "gn-chip gn-collection-chip",
        "aria-pressed": String((collection?.id || null) === id),
        onClick: () => {
          state.collection = id;
          render();
        },
      },
      id ? icon("folder") : null,
      el("span", {}, label),
      el("small", {}, String(count)),
    );
  return el(
    "div",
    { class: "gn-collections", role: "group", "aria-label": t("Collections") },
    chip(t("All"), null, state.notebooks.length),
    (state.collections || []).map((c) =>
      chip(
        c.name,
        c.id,
        state.notebooks.filter((n) => c.notebookIds.includes(n.id)).length,
      ),
    ),
    button("New collection", () => newCollection(), "gn-chip quiet", "plus"),
    collection
      ? menuButton("Collection options", [
          [
            "Rename",
            "edit",
            () =>
              collectionNameModal(
                "Rename collection",
                collection.name,
                (name) =>
                  api("collections/" + collection.id, {
                    method: "PATCH",
                    data: { name },
                  }),
              ),
          ],
          [
            "Delete collection",
            "trash",
            () =>
              confirmAction(
                "Delete collection",
                "The notebooks in this collection are kept.",
                async () => {
                  await api("collections/" + collection.id, {
                    method: "DELETE",
                  });
                  state.collection = null;
                  await refreshData();
                  render();
                },
              ),
            true,
          ],
        ])
      : null,
  );
}
/** Tick the collections a notebook belongs to; changes save immediately. */
function collectionModal(n) {
  const list = el("div", { class: "stack" });
  const draw = () =>
    list.replaceChildren(
      ...(state.collections.length
        ? state.collections.map((c) =>
            el(
              "label",
              { class: "gn-collection-option" },
              el("input", {
                type: "checkbox",
                checked: c.notebookIds.includes(n.id),
                onChange: (e) =>
                  void action(async () => {
                    await api(`collections/${c.id}/notebooks/${n.id}`, {
                      method: e.target.checked ? "PUT" : "DELETE",
                    });
                    await refreshData();
                    draw();
                  }),
              }),
              el("span", {}, c.name),
            ),
          )
        : [el("p", { class: "muted" }, t("No collections yet."))]),
    );
  draw();
  const dialog = modal(
    "Add to a collection",
    el(
      "div",
      { class: "stack" },
      el("p", { class: "muted small" }, n.title),
      list,
      el(
        "div",
        { class: "dialog-actions" },
        button(
          "New collection",
          () =>
            newCollection((id) =>
              api(`collections/${id}/notebooks/${n.id}`, { method: "PUT" }),
            ),
          "",
          "plus",
        ),
        button("Done", () => $("#dialog").close(), "primary"),
      ),
    ),
  );
  dialog.addEventListener(
    "close",
    () => {
      if (state.page !== "notebook") render();
    },
    { once: true },
  );
}
function notebooksView() {
  return el(
    "div",
    { class: "stack gn-home" },
    heading(
      "My notebooks",
      "Sources stay with your notebook when you switch models.",
      button("New notebook", newNotebook, "gn-pill gn-dark", "plus"),
    ),
    state.notebooks.length ? collectionBar() : null,
    state.notebooks.length
      ? notebookGallery(collectionNotebooks(), { search: true })
      : empty(
          "No notebooks yet",
          "Import notes, a chapter, or a worksheet to begin.",
          button("New notebook", newNotebook, "primary", "plus"),
        ),
  );
}
function newNotebook() {
  const title = el("input", {
      required: true,
      maxlength: 200,
      placeholder: "e.g. Biology · Cell structures",
    }),
    description = el("textarea", {
      maxlength: 1000,
      rows: 3,
      placeholder: "What are you working toward?",
    }),
    picker = emojiPicker(emojiChoices[0]);
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        void action(async () => {
          const n = await api("notebooks", {
            method: "POST",
            data: {
              title: title.value,
              description: description.value,
              emoji: picker.value,
            },
          });
          $("#dialog").close();
          await refreshData();
          nav("notebook/" + n.id);
          toast("Notebook created.");
        });
      },
    },
    field("Title", title),
    field("Description", description),
    el(
      "div",
      { class: "stack tight" },
      el("span", { class: "small strong" }, t("Icon")),
      picker.node,
    ),
    el(
      "div",
      { class: "dialog-actions" },
      button("Cancel", () => $("#dialog").close()),
      el(
        "button",
        { class: "button primary", type: "submit" },
        t("Create notebook"),
      ),
    ),
  );
  modal("New notebook", form);
}
// --- Workspace --------------------------------------------------------------
function togglePanel(panel) {
  state.collapsed.has(panel)
    ? state.collapsed.delete(panel)
    : state.collapsed.add(panel);
  render();
  $("#toggle-" + panel)?.focus();
}
function panelToggle(panel) {
  const hidden = state.collapsed.has(panel);
  const label =
    panel === "sources"
      ? hidden
        ? "Show sources"
        : "Hide sources"
      : hidden
        ? "Show studio"
        : "Hide studio";
  const control = iconButton(
    panel === "sources" ? "panelLeft" : "panelRight",
    label,
    () => togglePanel(panel),
  );
  control.id = "toggle-" + panel;
  control.classList.add("panel-toggle");
  control.setAttribute("aria-controls", "panel-" + panel);
  control.setAttribute("aria-expanded", String(!hidden));
  return control;
}
const formatLabels = {
  pdf: "PDF",
  docx: "DOC",
  pptx: "PPT",
  epub: "EPUB",
  md: "MD",
  txt: "TXT",
  csv: "CSV",
};
function syncSelection() {
  const w = state.workspace;
  if (!w) return;
  const ready = w.sources.filter((s) => s.status === "ready");
  document.querySelectorAll("input[data-source-id]").forEach((input) => {
    input.checked = state.selected.has(input.dataset.sourceId);
    input
      .closest(".gn-source-row")
      ?.classList.toggle("is-selected", input.checked);
  });
  const all = $("#select-all-sources");
  if (all) {
    all.checked =
      ready.length > 0 && ready.every((s) => state.selected.has(s.id));
    all.indeterminate = state.selected.size > 0 && !all.checked;
  }
  const count = $("#composer-source-count");
  if (count)
    count.textContent = plural(state.selected.size, "source", "sources");
}
function workspaceView() {
  const w = state.workspace,
    n = w.notebook;
  const titleButton = el(
    "button",
    {
      type: "button",
      class: "gn-title-button",
      title: canEdit() ? t("Rename notebook") : n.title,
      disabled: !canEdit(),
      onClick: () => editTitle(),
    },
    n.title,
  );
  const h1 = el("h1", { class: "gn-title" }, titleButton);
  function editTitle() {
    const input = el("input", {
      class: "gn-title-input",
      value: n.title,
      maxlength: 200,
      "aria-label": t("Notebook title"),
    });
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (!save || !value || value === n.title) {
        h1.replaceChildren(titleButton);
        titleButton.focus();
        return;
      }
      void action(async () => {
        await api("notebooks/" + n.id, {
          method: "PATCH",
          data: { title: value },
        });
        await afterNotebookChange(n.id);
      }).then(() => {
        if (h1.isConnected) h1.replaceChildren(titleButton);
      });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    h1.replaceChildren(input);
    input.focus();
    input.select();
  }
  const shareButton = isOwner()
    ? button("Share", () => shareModal(n), "gn-pill gn-hide-small", "share")
    : null;
  const accessBanner =
    w.access === "owner"
      ? null
      : el(
          "div",
          { class: "gn-access-banner", role: "note" },
          icon(w.access === "view" ? "eye" : "users"),
          el(
            "span",
            {},
            w.access === "view"
              ? `${t("View only")} · ${t("shared by")} ${w.owner?.name || ""}`
              : `${t("Can edit")} · ${t("shared by")} ${w.owner?.name || ""}`,
          ),
        );
  const exportNotebook = () =>
    action(async () =>
      download(
        (n.title || "folio-notebook").replace(/[\\/:*?"<>|]+/g, " ") + ".json",
        JSON.stringify(await api("notebooks/" + n.id + "/export"), null, 2),
        "application/json",
      ),
    );
  const graphButton = button(
    "Graph",
    () => nav("graph/" + n.id),
    "gn-pill gn-hide-small",
    "graph",
  );
  graphButton.setAttribute("aria-label", t("Graph view"));
  graphButton.title = t("Graph view");
  const options = menuButton("Notebook options", [
    isOwner() && ["Share", "share", () => shareModal(n)],
    isOwner() && [
      "Copy notebook",
      "copy",
      () =>
        confirmAction(
          "Copy notebook",
          t(
            "Create a notebook with the same settings and ready sources. Chat and study resources stay in the original.",
          ),
          async () => {
            const { id } = await api("notebooks/" + n.id + "/copy", {
              method: "POST",
              data: {},
            });
            nav("notebook/" + id);
          },
          "Copy",
        ),
    ],
    [
      "Notebook activity",
      "chart",
      () =>
        modal(
          "Notebook activity",
          el(
            "dl",
            { class: "folio-notebook-activity" },
            [
              [
                "Ready sources",
                w.sources.filter((s) => s.status === "ready").length,
              ],
              ["Chat messages", w.messages.length],
              ["Study resources", w.artifacts.length],
            ].map(([label, count]) => [
              el("dt", {}, t(label)),
              el("dd", {}, count),
            ]),
          ),
        ),
    ],
    canEdit() && ["Configure chat", "sliders", notebookSettings],
    canEdit() && ["Customize notebook", "edit", () => customizeNotebook(n)],
    ["Graph view", "graph", () => nav("graph/" + n.id)],
    ["Export notebook", "download", exportNotebook],
    !isOwner() && [
      "Block account",
      "eye",
      () => blockAccount(w.owner.id, () => nav("shared")),
      true,
    ],
  ]);
  const tabs = el(
    "div",
    {
      class: "mobile-tabs gn-tabs",
      role: "tablist",
      "aria-label": t("Notebook panels"),
    },
    [
      ["sources", "Sources"],
      ["chat", "Chat"],
      ["studio", "Studio"],
    ].map(([panel, label]) =>
      el(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": String(state.panel === panel),
          "aria-controls": "panel-" + panel,
          class: state.panel === panel ? "active" : "",
          onClick: () => {
            state.panel = panel;
            state.collapsed.delete(panel);
            render();
          },
        },
        t(label),
      ),
    ),
  );
  return el(
    "main",
    { id: "main", tabindex: "-1", class: "gn-app" },
    el(
      "header",
      { class: "gn-topbar" },
      el(
        "a",
        {
          href: "#dashboard",
          class: "gn-logo",
          "aria-label": t("Folio home"),
          title: t("Folio home"),
        },
        icon("book"),
      ),
      h1,
      accessBanner,
      el(
        "div",
        { class: "gn-top-actions" },
        newUpdateButton("gn-pill"),
        button(
          "New notebook",
          newNotebook,
          "gn-pill gn-dark gn-hide-small",
          "plus",
        ),
        shareButton,
        graphButton,
        options,
        iconButton("sun", "Theme", toggleTheme),
        accountControls(),
      ),
    ),
    tabs,
    el(
      "div",
      {
        class:
          "gn-panels" + [...state.collapsed].map((p) => " hide-" + p).join(""),
      },
      state.collapsed.has("sources") ? collapsedRail("sources") : sourcesView(),
      conversationView(),
      state.collapsed.has("studio") ? collapsedRail("studio") : studioView(),
    ),
    el(
      "p",
      { class: "gn-footnote" },
      t("Folio can be inaccurate; please double-check its responses."),
    ),
  );
}
function collapsedRail(panel) {
  const sources = panel === "sources";
  return el(
    "aside",
    {
      class: "gn-panel gn-collapsed",
      "aria-label": t(sources ? "Sources" : "Studio"),
    },
    panelToggle(panel),
    el(
      "div",
      { class: "gn-collapsed-items" },
      sources
        ? [
            iconButton("plus", "Upload a file", uploadModal),
            ...state.workspace.sources.slice(0, 14).map((s) =>
              el(
                "button",
                {
                  type: "button",
                  class: "gn-mini-source fmt-" + s.format,
                  title: s.title,
                  "aria-label": t("Open") + " " + s.title,
                  onClick: () => void action(() => sourceModal(s.id)),
                },
                formatLabels[s.format] || "DOC",
              ),
            ),
          ]
        : studioTools.map(([kind, label, glyph]) => {
            const b = iconButton(glyph, label, () => runTool(kind));
            b.classList.add("gn-mini-tool", "tool-" + kind);
            return b;
          }),
    ),
  );
}
function sourceRow(s) {
  const w = state.workspace;
  const busyState = ["queued", "processing"].includes(s.status);
  return el(
    "div",
    {
      class: "gn-source-row" + (state.selected.has(s.id) ? " is-selected" : ""),
      role: "listitem",
    },
    el(
      "span",
      { class: "gn-file-badge fmt-" + s.format, "aria-hidden": "true" },
      formatLabels[s.format] || "DOC",
    ),
    el(
      "div",
      { class: "gn-source-text" },
      el(
        "button",
        {
          type: "button",
          class: "source-name",
          title: s.title,
          onClick: () => void action(() => sourceModal(s.id)),
        },
        s.title,
      ),
      s.status !== "ready"
        ? el(
            "small",
            { class: "gn-source-status status-" + s.status },
            busyState ? el("span", { class: "spinner" }) : null,
            t(s.status[0].toUpperCase() + s.status.slice(1)),
          )
        : null,
      s.error ? el("small", { class: "error" }, s.error) : null,
      s.topic
        ? el("small", { class: "gn-source-topic" }, icon("tag"), s.topic)
        : null,
    ),
    menuButton("Source options", [
      canEdit() && ["Set topic", "tag", () => topicModal(s)],
      canEdit() && [
        "Rename",
        "edit",
        () =>
          renameModal("Rename source", s.title, async (title) => {
            await api("sources/" + s.id, { method: "PATCH", data: { title } });
            await openNotebook(w.notebook.id);
          }),
      ],
      [
        "Download original",
        "download",
        () => {
          const link = el("a", {
            href: "/api/sources/" + s.id + "/file",
            download: "",
          });
          document.body.append(link);
          link.click();
          link.remove();
        },
      ],
      canEdit() && [
        "Remove source",
        "trash",
        () =>
          confirmAction("Delete", s.title, async () => {
            await api("sources/" + s.id, { method: "DELETE" });
            await openNotebook(w.notebook.id);
          }),
        true,
      ],
    ]),
    el("input", {
      type: "checkbox",
      class: "gn-check",
      "data-source-id": s.id,
      checked: state.selected.has(s.id),
      disabled: s.status !== "ready",
      "aria-label": "Select " + s.title,
      onChange: (e) => {
        e.target.checked
          ? state.selected.add(s.id)
          : state.selected.delete(s.id);
        syncSelection();
      },
    }),
  );
}
function topicModal(s) {
  const input = el("input", { maxlength: 40, value: s.topic || "" });
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          await api("sources/" + s.id, {
            method: "PATCH",
            data: { topic: input.value.trim() },
          });
          $("#dialog").close();
          await openNotebook(state.activeNotebook);
          toast("Saved.");
        });
      },
    },
    field("Topic", input, "Leave empty to remove the topic."),
    el(
      "div",
      { class: "dialog-actions" },
      button("Cancel", () => $("#dialog").close()),
      el("button", { class: "button primary", type: "submit" }, t("Save")),
    ),
  );
  modal("Set topic", form);
  input.select();
}
/** Ask the AI in use to label the selected sources by topic; the server saves the labels. */
async function autoLabelSources() {
  const selection = aiSelection();
  if (!selection.sourceIds.length)
    throw new Error("Select at least one ready source.");
  await api("notebooks/" + state.activeNotebook + "/generate", {
    method: "POST",
    data: { ...selection, kind: "labels" },
  });
  store("folio-source-sort", "topic");
  await openNotebook(state.activeNotebook);
  toast("Sources labelled.");
}
const sourceSorts = {
  added: () => 0,
  name: (a, b) => a.title.localeCompare(b.title, state.locale),
  type: (a, b) =>
    a.format.localeCompare(b.format) ||
    a.title.localeCompare(b.title, state.locale),
  // Unlabelled sources go last.
  topic: (a, b) =>
    Number(!a.topic) - Number(!b.topic) ||
    (a.topic || "").localeCompare(b.topic || "", state.locale) ||
    a.title.localeCompare(b.title, state.locale),
};
function sourcesView() {
  const w = state.workspace;
  const ready = w.sources.filter((s) => s.status === "ready");
  const list = el("div", { class: "gn-source-list source-list", role: "list" });
  let sort = stored("folio-source-sort", "added"),
    query = "";
  if (!sourceSorts[sort]) sort = "added";
  const renderList = () => {
    const matches = w.sources
      .filter((s) =>
        (s.title + " " + (s.topic || ""))
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .sort(sourceSorts[sort]);
    const rows = [];
    let group;
    for (const s of matches) {
      const name = s.topic || t("No topic");
      if (sort === "topic" && name !== group) {
        group = name;
        rows.push(el("p", { class: "gn-source-group" }, name));
      }
      rows.push(sourceRow(s));
    }
    list.replaceChildren(...rows);
    if (!matches.length)
      list.append(el("p", { class: "muted small" }, t("No matching sources.")));
    syncSelection();
  };
  renderList();
  const sortSelect = el(
    "select",
    {
      "aria-label": t("Sort sources"),
      onChange: (e) => {
        sort = e.target.value;
        store("folio-source-sort", sort);
        renderList();
      },
    },
    [
      ["added", "Date added"],
      ["name", "Name"],
      ["type", "Type"],
      ["topic", "Topic"],
    ].map(([value, label]) =>
      el("option", { value, selected: value === sort }, t(label)),
    ),
  );
  const selectAll = el("input", {
    type: "checkbox",
    class: "gn-check",
    id: "select-all-sources",
    disabled: !ready.length,
    "aria-label": t("Select all sources"),
    onChange: (e) => {
      state.selected = e.target.checked
        ? new Set(ready.map((s) => s.id))
        : new Set();
      syncSelection();
    },
  });
  return el(
    "section",
    {
      class: "gn-panel gn-sources",
      id: "panel-sources",
      "data-active": String(state.panel === "sources"),
      "aria-label": t("Sources"),
    },
    el(
      "div",
      { class: "gn-panel-head" },
      el("h2", {}, t("Sources")),
      panelToggle("sources"),
    ),
    el(
      "div",
      { class: "gn-panel-body" },
      canEdit()
        ? button("Add sources", uploadModal, "gn-add-source", "plus")
        : null,
      w.sources.length
        ? [
            el(
              "label",
              { class: "gn-search" },
              icon("search"),
              el("input", {
                type: "search",
                placeholder: t("Search sources"),
                "aria-label": t("Search sources"),
                onInput: (e) => {
                  query = e.target.value;
                  renderList();
                },
              }),
            ),
            el(
              "div",
              { class: "gn-source-tools" },
              sortSelect,
              canEdit()
                ? button(
                    "Auto-label",
                    () => action(autoLabelSources),
                    "gn-chip small",
                    "wand",
                  )
                : null,
            ),
            el(
              "label",
              { class: "gn-select-all" },
              el("span", {}, t("Select all sources")),
              selectAll,
            ),
            list,
          ]
        : el(
            "div",
            { class: "gn-empty" },
            icon("file"),
            el("strong", {}, t("Saved sources will appear here")),
            el(
              "p",
              {},
              t(
                "Click Add sources to upload PDFs, Word documents, text, Markdown or CSV files.",
              ),
            ),
            editOnly(
              button(
                "Load a sample source",
                () => action(loadSample),
                "gn-pill small",
              ),
            ),
          ),
    ),
    el(
      "p",
      { class: "gn-disclosure" },
      icon("book"),
      t("Your material is sent only to the provider you select."),
    ),
  );
}
const followUps = [
  "Explain that more simply",
  "Give me a concrete example",
  "Quiz me on this",
  "What should I review next?",
];
function chatTranscript(w) {
  return (
    `# ${w.notebook.title}\n\n` +
    w.messages
      .map((m) => (m.role === "user" ? "**You:** " : "**Folio:** ") + m.text)
      .join("\n\n")
  );
}
function summaryModal(n) {
  const text = el("textarea", {
    class: "editor",
    maxlength: 1000,
    value: n.description || "",
  });
  modal(
    "Notebook summary",
    el(
      "form",
      {
        class: "stack",
        onSubmit: (e) => {
          e.preventDefault();
          void action(async () => {
            await api("notebooks/" + n.id, {
              method: "PATCH",
              data: { description: text.value },
            });
            $("#dialog").close();
            await afterNotebookChange(n.id);
          });
        },
      },
      field(
        "Summary",
        text,
        "Shown at the top of the chat. Markdown bold is supported.",
      ),
      el(
        "div",
        { class: "dialog-actions" },
        button("Cancel", () => $("#dialog").close()),
        el("button", { class: "button primary", type: "submit" }, t("Save")),
      ),
    ),
  );
}
function conversationView() {
  const w = state.workspace,
    n = w.notebook;
  const ready = w.sources.filter((s) => s.status === "ready");
  const messages = el(
    "div",
    { class: "messages", id: "messages", "aria-live": "polite" },
    w.messages.map(messageView),
  );
  const input = el("textarea", {
    "aria-label": t("Chat"),
    placeholder: !state.connections.length
      ? t("Connect a provider")
      : w.sources.length
        ? t("Ask a question or create something…")
        : t("Upload a source to get started"),
    maxlength: 8000,
    rows: 1,
    value: state.drafts.get(state.activeNotebook) || "",
    onInput: (e) => {
      state.drafts.set(state.activeNotebook, e.target.value);
      grow();
    },
  });
  const grow = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  };
  requestAnimationFrame(grow);
  const mode = el(
    "select",
    { "aria-label": t("Grounding mode") },
    el("option", { value: "strict" }, t("Strict sources")),
    el("option", { value: "broad" }, t("Broader knowledge")),
  );
  const model = modelSelect(async (connectionId, chosen) => {
    await action(async () => {
      try {
        await saveModel(connectionId, chosen);
      } catch (error) {
        const current = activeAi();
        model.value = current
          ? JSON.stringify([current.connectionId, current.model])
          : "";
        throw error;
      }
    });
  });
  const effort = effortControl(
    w.notebook.settings.effort,
    (value) => action(() => saveEffort(value, w.notebook.id)),
    activeAi()?.model,
  );
  const send = el(
    "button",
    {
      class: "gn-send",
      type: "submit",
      disabled: state.busy,
      "aria-label": t("Send"),
      title: t("Send"),
    },
    icon("send"),
  );
  const webEnabled = () => stored("folio-chat-web", "on") === "on";
  const connectedApps = menuButton(
    "Connected apps",
    () => [
      [
        webEnabled() ? "Turn off web links" : "Turn on web links",
        "globe",
        () => {
          store("folio-chat-web", webEnabled() ? "off" : "on");
          connectedApps.title = t(
            webEnabled() ? "Web links on" : "Web links off",
          );
          connectedApps.focus();
        },
      ],
      state.drive?.enabled &&
        canEdit() && [
          "Google Drive",
          "file",
          () => action(() => openDriveDraft(input.value)),
        ],
      ["Connect an app", "plug", () => nav("connections")],
    ],
    "sliders",
  );
  connectedApps.title = t(webEnabled() ? "Web links on" : "Web links off");
  const submit = (text) =>
    void sendMessage(text, input, mode.value, send, webEnabled());
  const form = el(
    "form",
    {
      class: "composer gn-composer",
      onSubmit: (e) => {
        e.preventDefault();
        if (input.value.trim()) submit(input.value);
      },
    },
    w.messages.length && ready.length
      ? el(
          "div",
          {
            class: "gn-followups",
            role: "group",
            "aria-label": t("Suggested questions"),
          },
          followUps.map((q) =>
            el(
              "button",
              {
                type: "button",
                class: "gn-followup",
                onClick: () => submit(t(q)),
              },
              t(q),
            ),
          ),
        )
      : null,
    el(
      "div",
      { class: "composer-box" },
      el(
        "div",
        { class: "gn-composer-main" },
        connectedApps,
        input,
        el(
          "span",
          { class: "gn-count", id: "composer-source-count" },
          plural(state.selected.size, "source", "sources"),
        ),
        send,
      ),
      el(
        "div",
        { class: "composer-footer gn-composer-tools" },
        model,
        effort,
        mode,
      ),
    ),
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  const fill = (text) => {
    input.value = t(text);
    state.drafts.set(state.activeNotebook, input.value);
    grow();
    input.focus();
  };
  const overviewPrompt = () =>
    state.locale === "pt-BR"
      ? "Crie uma visão geral das fontes selecionadas, com temas principais, conexões e citações."
      : "Create an overview of the selected sources with key themes, connections, and citations.";
  const suggestions = Array.isArray(n.settings?.suggestions)
    ? n.settings.suggestions.filter((s) => typeof s === "string").slice(0, 5)
    : [];
  let intro;
  if (!w.sources.length)
    intro = el(
      "div",
      { class: "gn-welcome", id: "chat-welcome" },
      el("span", { class: "gn-welcome-emoji", "aria-hidden": "true" }, "👋"),
      el("h2", {}, t("Let’s start your notebook…")),
      el(
        "p",
        {},
        t(
          "This is your blank canvas to understand, create, or make progress on something new. Add your own sources to get started.",
        ),
      ),
      el(
        "p",
        { class: "strong" },
        t("What would you like this notebook to help you do?"),
      ),
      el(
        "div",
        { class: "gn-chip-stack" },
        button("Upload a file", uploadModal, "gn-chip", "upload"),
        button(
          "Load a sample source",
          () => action(loadSample),
          "gn-chip",
          "spark",
        ),
        !state.connections.length
          ? button(
              "Connect an AI provider",
              () => nav("connections"),
              "gn-chip",
              "plug",
            )
          : null,
      ),
    );
  else
    intro = el(
      "header",
      { class: "gn-chat-intro" },
      el(
        "button",
        {
          type: "button",
          class: "gn-intro-emoji",
          "aria-label": t("Change icon"),
          title: t("Change icon"),
          onClick: () => iconModal(n),
        },
        notebookEmoji(n),
      ),
      el("p", { class: "gn-intro-title" }, n.title),
      el(
        "p",
        { class: "gn-intro-meta" },
        plural(w.sources.length, "source", "sources") +
          " · " +
          relativeTime(n.updated),
      ),
      n.description
        ? el("div", { class: "gn-intro-summary" }, markdown(n.description))
        : el(
            "p",
            { class: "gn-intro-hint" },
            t(
              "Create an overview, then pin the answer as this notebook’s summary.",
            ),
          ),
      el(
        "div",
        { class: "gn-intro-actions" },
        ready.length
          ? button(
              "Create an overview",
              () => submit(overviewPrompt()),
              "gn-chip",
              "spark",
            )
          : null,
        button(
          n.description ? "Edit summary" : "Write a summary",
          () => summaryModal(n),
          "gn-chip quiet",
          "edit",
        ),
        ready.length && canEdit()
          ? button(
              suggestions.length ? "Refresh questions" : "Suggest questions",
              () => action(suggestQuestions),
              "gn-chip quiet",
              "spark",
            )
          : null,
      ),
      suggestions.length
        ? el(
            "div",
            {
              class: "gn-chip-stack",
              role: "group",
              "aria-label": t("Suggested questions"),
            },
            suggestions.map((s) =>
              el(
                "button",
                {
                  type: "button",
                  class: "gn-chip suggestion",
                  onClick: () => fill(s),
                },
                s,
              ),
            ),
          )
        : null,
      !w.messages.length && ready.length
        ? el(
            "div",
            { id: "chat-welcome", class: "gn-starters" },
            el(
              "div",
              { class: "gn-quick-cards" },
              [
                ["note", "Add note", "Write a note", () => noteModal()],
                [
                  "audio",
                  "Audio overview",
                  "Create an audio overview",
                  () => generateModal("audio"),
                ],
                [
                  "file",
                  "Briefing doc",
                  "Create a briefing doc",
                  () => generateModal("guide", { format: "Briefing document" }),
                ],
              ].map(([glyph, label, aria, fn]) =>
                el(
                  "button",
                  {
                    type: "button",
                    class: "gn-quick-card",
                    "aria-label": t(aria),
                    onClick: fn,
                  },
                  icon(glyph),
                  el("span", {}, t(label)),
                ),
              ),
            ),
            suggestions.length
              ? null
              : el(
                  "div",
                  { class: "gn-chip-stack" },
                  [
                    "Summarize the main ideas",
                    "Explain a difficult concept step by step",
                    "Compare the key concepts",
                  ].map((s) => button(s, () => fill(s), "gn-chip suggestion")),
                ),
          )
        : null,
    );
  return el(
    "section",
    {
      class: "gn-panel gn-chat",
      id: "panel-chat",
      "data-active": String(state.panel === "chat"),
      "aria-label": t("Chat"),
    },
    el(
      "div",
      { class: "gn-panel-head" },
      el("h2", {}, t("Chat")),
      el(
        "div",
        { class: "row tight" },
        editOnly(iconButton("sliders", "Configure chat", notebookSettings)),
        menuButton("Chat options", () => [
          ["Study prompts", "wand", () => promptsModal(fill)],
          canEdit() && ["Teaching style", "settings", notebookSettings],
          w.messages.length
            ? [
                "Save chat as note",
                "note",
                () =>
                  noteModal({
                    title: n.title + " — chat",
                    markdown: chatTranscript(w),
                  }),
              ]
            : null,
          w.messages.length
            ? [
                "Download chat",
                "download",
                () =>
                  download(
                    n.title + " — chat.md",
                    chatTranscript(w),
                    "text/markdown",
                  ),
              ]
            : null,
          w.messages.length && canEdit()
            ? [
                "Clear chat history",
                "trash",
                () =>
                  confirmAction(
                    "Clear chat history",
                    t(
                      "Remove every chat message in this notebook? Sources and saved resources stay.",
                    ),
                    async () => {
                      await api("notebooks/" + n.id + "/messages", {
                        method: "DELETE",
                      });
                      await openNotebook(n.id);
                    },
                    "Delete",
                  ),
                true,
              ]
            : null,
        ]),
      ),
    ),
    el("div", { class: "gn-chat-scroll", id: "chat-scroll" }, intro, messages),
    canEdit()
      ? form
      : el(
          "p",
          { class: "gn-view-only-note" },
          icon("eye"),
          t(
            "This notebook is view only. Read the conversation, sources and study resources to learn from it.",
          ),
        ),
  );
}
function messageView(m) {
  if (m.role === "user")
    return el("article", { class: "message user" }, m.text);
  return el(
    "article",
    { class: "message assistant" },
    el(
      "div",
      { class: "message-meta" },
      icon("spark"),
      "Folio",
      m.provider ? " · " + m.provider + " · " + m.model : "",
    ),
    markdown(m.text, m.citations),
    el(
      "div",
      { class: "gn-message-actions" },
      button(
        "Save to note",
        () => noteModal({ markdown: m.text, title: "Saved explanation" }),
        "gn-chip small",
        "note",
      ),
      iconButton("copy", "Copy", () =>
        action(async () => {
          await navigator.clipboard.writeText(m.text);
          toast("Copied.");
        }),
      ),
      iconButton("pin", "Use as notebook summary", () =>
        action(async () => {
          let text = m.text.replace(/\s?\[\d+\]/g, "").trim();
          if (text.length > 1000) {
            const cut = text.slice(0, 1000);
            text =
              cut.slice(0, Math.max(cut.lastIndexOf(". ") + 1, 600)) || cut;
          }
          await api("notebooks/" + state.activeNotebook, {
            method: "PATCH",
            data: { description: text },
          });
          await afterNotebookChange(state.activeNotebook);
          toast("Saved.");
        }),
      ),
      iconButton("refresh", "Regenerate", () => {
        const all = state.workspace.messages;
        const index = all.findIndex((x) => x.id === m.id);
        const previous = all
          .slice(0, index)
          .reverse()
          .find((x) => x.role === "user");
        if (previous) void sendMessage(previous.text);
      }),
      canEdit() ? feedbackButtons(m) : null,
    ),
  );
}
/** Good/bad rating for an answer; pressing the active rating clears it. */
function feedbackButtons(m) {
  const sync = () =>
    buttons.forEach((b) =>
      b.setAttribute("aria-pressed", String(m.feedback === b.dataset.value)),
    );
  const buttons = [
    ["up", "thumbUp", "Good response"],
    ["down", "thumbDown", "Bad response"],
  ].map(([value, glyph, label]) => {
    const b = iconButton(glyph, label, () =>
      action(async () => {
        const feedback = m.feedback === value ? null : value;
        await api("messages/" + m.id, { method: "PATCH", data: { feedback } });
        m.feedback = feedback;
        sync();
      }),
    );
    b.classList.add("gn-feedback");
    b.dataset.value = value;
    return b;
  });
  sync();
  return buttons;
}
const studioTools = [
  ["path", "Learning overview", "list"],
  ["audio", "Audio overview", "audio"],
  ["slides", "Slide deck", "slides"],
  ["mindmap", "Mind map", "map"],
  ["reports", "Reports", "file"],
  ["flashcards", "Flashcards", "cards"],
  ["quiz", "Quiz", "quiz"],
  ["table", "Data table", "table"],
  ["guide", "Study guide", "book"],
  ["infographic", "Infographic", "chart"],
];
const studioDescriptions = {
  infographic: "The big picture on one page",
  audio: "Listen to a two-host conversation",
  slides: "Present the key ideas",
  mindmap: "Connect the dots",
  reports: "Briefing document, FAQ, timeline, glossary",
  path: "Study in four stages",
  flashcards: "Make it memorable",
  quiz: "Put yourself to the test",
  table: "See it side by side",
  guide: "The ideas that matter",
};
const runTool = (kind) =>
  kind === "reports"
    ? reportsModal()
    : kind === "path"
      ? learningPathModal()
      : generateModal(kind);
// One resource per stage, in the order to study them.
const learningPath = [
  ["guide", "Introduction", "Read the study guide first."],
  ["infographic", "Visual explanation", "See the big picture on one page."],
  ["flashcards", "Practice", "Recall the key ideas with flashcards."],
  ["quiz", "Assessment", "Test yourself and review your mistakes."],
];
function learningPathModal() {
  const made = (kind) => state.workspace.artifacts.find((a) => a.kind === kind),
    ready = learningPath.filter(([kind]) => made(kind)).length;
  modal(
    "Learning overview",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        { class: "muted" },
        `${ready} ${t("of")} ${learningPath.length} ${t("stages ready")}`,
      ),
      el(
        "div",
        { class: "progress-bar", "aria-hidden": "true" },
        el("span", {
          style: `width:${(ready / learningPath.length) * 100}%`,
        }),
      ),
      el(
        "ol",
        { class: "path-list" },
        learningPath.map(([kind, stage, hint], i) => {
          const a = made(kind);
          return el(
            "li",
            { class: "path-step" + (a ? " is-ready" : "") },
            el(
              "span",
              { class: "path-number", "aria-hidden": "true" },
              a ? icon("check") : i + 1,
            ),
            el(
              "div",
              { class: "path-text" },
              el("strong", {}, t(stage)),
              el("span", { class: "muted small" }, a ? a.title : t(hint)),
            ),
            a
              ? button(
                  "Open",
                  () => {
                    $("#dialog").close();
                    void openArtifact(a.id);
                  },
                  "small",
                )
              : button("Create", () => generateModal(kind), "small primary"),
          );
        }),
      ),
    ),
  );
}
// Ready-made chat prompts for common study goals.
const studyPrompts = [
  [
    "Complete study guide",
    "Every section and definition, with a topic checklist.",
    "Using only my selected sources, write a complete, well-organized study guide. Cover every major section, definition, distinction, process, formula and example that an exam could ask about. Keep the sources' exact technical terms, cite the sources, and finish with a checklist of the topics covered.",
  ],
  [
    "Personal tutor",
    "One concept at a time; you answer before it corrects.",
    "Act as an expert tutor preparing me for an exam. Teach the selected material one concept at a time, from clear explanations to harder applications. Ask me a question after each concept and wait for my attempt before you correct it. Explain my mistakes with citations.",
  ],
  [
    "Hard practice exam",
    "Tricky multiple choice, answers only at the end.",
    "Give me a challenging multiple-choice practice exam on my selected sources: definitions, comparisons, applications and common misconceptions, with plausible wrong options. Ask the questions without revealing the answers. When I finish, give the answers, explanations and the topics I should review.",
  ],
  [
    "Confusing concepts",
    "A table of look-alike ideas, then questions on them.",
    "Find the concepts in the selected sources that students most often confuse: similar definitions, competing theories, close dates, or formulas with similar uses. Make a comparison table of the exact differences, then give me practice questions that tell them apart.",
  ],
  [
    "Final readiness check",
    "Tests every topic and sorts your mistakes by kind.",
    "Check whether I know this material well enough for an exam. Test me on a balanced selection of topics from all selected sources, one question at a time. After my answers, sort my mistakes into knowledge gaps, misunderstandings, application errors and careless errors, and recommend topics and source sections to review.",
  ],
];
function promptsModal(fill) {
  modal(
    "Study prompts",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        { class: "muted" },
        t("Pick a prompt to place it in the chat box. Edit it before you send."),
      ),
      el(
        "div",
        { class: "prompt-list" },
        studyPrompts.map(([title, summary, text]) =>
          el(
            "button",
            {
              type: "button",
              class: "prompt-card",
              onClick: () => {
                $("#dialog").close();
                fill(text);
              },
            },
            el("strong", {}, t(title)),
            el("span", {}, t(summary)),
          ),
        ),
      ),
    ),
  );
}
const toolDefinitions = [
  ["guide", "Study guide", "book"],
  ["flashcards", "Flashcards", "cards"],
  ["quiz", "Quiz", "quiz"],
  ["mindmap", "Mind map", "map"],
  ["table", "Data table", "table"],
  ["slides", "Slide deck", "slides"],
  ["audio", "Audio overview", "audio"],
  ["infographic", "Infographic", "chart"],
  ["note", "Note", "note"],
];
function studioView() {
  const artifacts = state.workspace.artifacts;
  return el(
    "section",
    {
      class: "gn-panel gn-studio",
      id: "panel-studio",
      "data-active": String(state.panel === "studio"),
      "aria-label": t("Studio"),
    },
    el(
      "div",
      { class: "gn-panel-head" },
      el("h2", {}, t("Studio")),
      panelToggle("studio"),
    ),
    el(
      "div",
      { class: "gn-panel-body gn-studio-body" },
      editOnly(
        el(
          "div",
          { class: "gn-tools" },
          studioTools.map(([kind, label, glyph]) =>
            el(
              "button",
              {
                type: "button",
                class: "gn-tool tool-" + kind,
                "aria-label": t(label),
                title: t(studioDescriptions[kind]),
                onClick: () => runTool(kind),
              },
              el(
                "span",
                { class: "gn-tool-text" },
                el("span", { class: "gn-tool-icon" }, icon(glyph)),
                el("span", { class: "gn-tool-label" }, t(label)),
              ),
              el(
                "span",
                { class: "gn-tool-go", "aria-hidden": "true" },
                icon("chevron"),
              ),
            ),
          ),
        ),
      ),
      editOnly(el("hr", { class: "gn-divider" })),
      artifacts.length
        ? [
            el(
              "div",
              { class: "gn-outputs-head" },
              el("h3", {}, t("Saved resources")),
              el("span", { class: "gn-count" }, artifacts.length),
            ),
            savedResources(artifacts),
          ]
        : el(
            "div",
            { class: "gn-empty gn-studio-empty" },
            icon("wand"),
            el("strong", {}, t("Studio output will be saved here.")),
            el(
              "p",
              {},
              t(
                "After adding sources, click to create an audio overview, study guide, mind map and more!",
              ),
            ),
          ),
    ),
    editOnly(
      el(
        "div",
        { class: "gn-studio-footer" },
        button("Add note", () => noteModal(), "gn-pill gn-dark", "note"),
        button("Manual deck", manualDeck, "gn-pill", "cards"),
      ),
    ),
  );
}
function savedResources(artifacts) {
  const list = el(
    "div",
    { class: "gn-output-list artifact-list" },
    artifacts.map(artifactRow),
  );
  const search = el("input", {
    type: "search",
    placeholder: t("Search saved resources"),
    "aria-label": t("Search saved resources"),
    onInput: () => {
      const matches = artifacts.filter((a) =>
        a.title.toLowerCase().includes(search.value.toLowerCase()),
      );
      list.replaceChildren(...matches.map(artifactRow));
      if (!matches.length)
        list.append(
          el("p", { class: "muted small" }, t("No matching resources.")),
        );
    },
  });
  return el(
    "div",
    { class: "stack tight resource-search" },
    el("label", { class: "gn-search" }, icon("search"), search),
    list,
  );
}
function artifactRow(a) {
  const def = toolDefinitions.find((x) => x[0] === a.kind);
  const sourceCount = new Set((a.citations || []).map((c) => c.sourceId)).size;
  return el(
    "div",
    { class: "gn-output kind-" + a.kind },
    el(
      "button",
      {
        type: "button",
        class: "artifact-row",
        onClick: () => void action(() => openArtifact(a.id)),
      },
      el(
        "span",
        { class: "gn-output-icon tool-" + a.kind, "aria-hidden": "true" },
        icon(def?.[2] || "note"),
      ),
      el(
        "span",
        { class: "gn-output-text" },
        el("strong", {}, a.title),
        el(
          "small",
          {},
          [
            t(def?.[1] || "Note"),
            sourceCount ? plural(sourceCount, "source", "sources") : null,
            relativeTime(a.created),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
    ),
    a.kind === "audio"
      ? iconButton("play", "Play", () => void action(() => openArtifact(a.id)))
      : null,
    menuButton("Resource options", [
      canEdit() && [
        "Rename",
        "edit",
        () =>
          renameModal("Rename", a.title, async (title) => {
            await api("artifacts/" + a.id, {
              method: "PATCH",
              data: { title },
            });
            await openNotebook(state.activeNotebook);
          }),
      ],
      ["Download", "download", () => exportArtifact(a)],
      canEdit() && [
        "Delete",
        "trash",
        () =>
          confirmAction("Delete", a.title, async () => {
            await api("artifacts/" + a.id, { method: "DELETE" });
            await openNotebook(state.activeNotebook);
          }),
        true,
      ],
    ]),
  );
}
// --- Audio overview (spoken locally with the browser's speech voices) -------
const audioFormats = {
  "Deep dive":
    "Audio format: deep dive. A lively conversation that unpacks and connects the main ideas.",
  Brief:
    "Audio format: brief. A short overview that covers only the core ideas.",
  Critique:
    "Audio format: critique. Constructively review the sources: strengths, gaps and open questions.",
  Debate:
    "Audio format: debate. The two hosts take different perspectives grounded in the sources.",
};
function audioTranscript(a) {
  return (
    `# ${a.title}\n\n${a.content.summary || ""}\n\n` +
    a.content.lines
      .map((l) => `**${l.speaker === "A" ? "Alex" : "Sam"}:** ${l.text}`)
      .join("\n\n") +
    "\n\n" +
    a.citations
      .map(
        (c) =>
          `[${c.id}] ${c.title} (${c.page ? "page " + c.page : "section " + c.section})`,
      )
      .join("\n")
  );
}
function audioModal(a) {
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  const lines = a.content.lines;
  const hosts = { A: "Alex", B: "Sam" };
  let index = 0,
    playing = false,
    token = 0;
  const rate = el(
    "select",
    { "aria-label": t("Speed") },
    ["0.8", "1", "1.15", "1.3", "1.5"].map((v) =>
      el("option", { value: v, selected: v === "1" }, v + "×"),
    ),
  );
  const voiceA = el("select", { "aria-label": t("Voice") + " · Alex" });
  const voiceB = el("select", { "aria-label": t("Voice") + " · Sam" });
  const voiceRow = el(
    "div",
    { class: "form-grid", hidden: true },
    field("Alex", voiceA),
    field("Sam", voiceB),
  );
  const lang =
    languageCodes[state.workspace?.notebook.settings.language] || "en";
  const fillVoices = () => {
    if (!synth) return;
    const voices = synth.getVoices();
    voiceRow.hidden = !voices.length;
    const preferred = voices.filter((v) =>
      v.lang.toLowerCase().startsWith(lang),
    );
    const ordered = [
      ...preferred,
      ...voices.filter((v) => !preferred.includes(v)),
    ];
    [voiceA, voiceB].forEach((select, i) => {
      const previous = select.value;
      select.replaceChildren(
        ...ordered.map((v) =>
          el("option", { value: v.voiceURI }, `${v.name} (${v.lang})`),
        ),
      );
      select.value =
        previous ||
        (preferred[i] || preferred[0] || ordered[0])?.voiceURI ||
        "";
    });
  };
  fillVoices();
  synth?.addEventListener("voiceschanged", fillVoices);
  const progress = el("progress", {
    max: lines.length,
    value: 0,
    "aria-label": t("Progress"),
  });
  const playButton = el("button", {
    type: "button",
    class: "button primary gn-play",
  });
  const setPlayLabel = () =>
    playButton.replaceChildren(
      icon(playing ? "pause" : "play"),
      el("span", {}, t(playing ? "Pause" : index > 0 ? "Resume" : "Play")),
    );
  const transcript = el(
    "ol",
    { class: "gn-transcript" },
    lines.map((l, i) =>
      el(
        "li",
        {},
        el(
          "button",
          {
            type: "button",
            class: "gn-line speaker-" + l.speaker,
            onClick: () => {
              index = i;
              start();
            },
          },
          el("strong", {}, hosts[l.speaker]),
          el("span", {}, l.text),
          l.refs?.length ? el("sup", {}, l.refs.join(", ")) : null,
        ),
      ),
    ),
  );
  const highlight = () => {
    transcript.querySelectorAll(".gn-line").forEach((b, i) => {
      const current = i === index && playing;
      b.classList.toggle("is-current", current);
      if (current) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    progress.value = index;
  };
  function speak() {
    if (index >= lines.length) {
      playing = false;
      index = 0;
      setPlayLabel();
      highlight();
      return;
    }
    const line = lines[index];
    const utterance = new SpeechSynthesisUtterance(line.text);
    const uri = line.speaker === "A" ? voiceA.value : voiceB.value;
    const voice = synth.getVoices().find((v) => v.voiceURI === uri);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = Number(rate.value);
    utterance.pitch = line.speaker === "A" ? 0.95 : 1.12;
    const mine = token;
    utterance.onend = () => {
      if (mine !== token || !playing) return;
      index++;
      speak();
    };
    utterance.onerror = (e) => {
      if (mine !== token || ["interrupted", "canceled"].includes(e.error))
        return;
      playing = false;
      setPlayLabel();
      toast("Speech playback failed on this device.", true);
    };
    highlight();
    synth.speak(utterance);
  }
  function start() {
    if (!synth) return;
    token++;
    synth.cancel();
    playing = true;
    setPlayLabel();
    speak();
  }
  function pause() {
    token++;
    playing = false;
    synth?.cancel();
    setPlayLabel();
    highlight();
  }
  playButton.addEventListener("click", () => (playing ? pause() : start()));
  setPlayLabel();
  const body = el(
    "div",
    { class: "stack gn-audio" },
    a.content.summary ? el("p", { class: "muted" }, a.content.summary) : null,
    synth
      ? el(
          "div",
          { class: "gn-player" },
          el(
            "span",
            { class: "gn-wave", "aria-hidden": "true" },
            icon("audio"),
          ),
          playButton,
          button(
            "Restart",
            () => {
              index = 0;
              start();
            },
            "quiet small",
            "refresh",
          ),
          progress,
          rate,
        )
      : el(
          "p",
          { class: "notice" },
          t(
            "This browser has no speech voices. Read or download the transcript instead.",
          ),
        ),
    synth ? voiceRow : null,
    el(
      "p",
      { class: "muted small" },
      t(
        "Spoken by your device’s built-in voices. The script was written by your selected AI provider from your sources; verify it against the citations.",
      ),
    ),
    transcript,
    citationButtons(a.citations),
    el(
      "div",
      { class: "dialog-actions" },
      button("Download transcript", () => exportArtifact(a), "", "download"),
      button(
        "Delete",
        () =>
          confirmAction("Delete", a.title, async () => {
            await api("artifacts/" + a.id, { method: "DELETE" });
            await openNotebook(state.activeNotebook);
          }),
        "danger",
        "trash",
      ),
    ),
  );
  const dialog = modal(a.title, body, true);
  dialog.addEventListener(
    "close",
    () => {
      token++;
      synth?.cancel();
      synth?.removeEventListener("voiceschanged", fillVoices);
    },
    { once: true },
  );
}
document.addEventListener("keydown", (e) => {
  if (
    e.key !== "/" ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    state.page !== "notebook" ||
    $("#dialog")?.open ||
    e.target.closest?.("input,textarea,select,[contenteditable=true]")
  )
    return;
  const input = $(".composer textarea");
  if (input) {
    e.preventDefault();
    input.focus();
  }
});

function aiSelection(
  settings = {
    ...state.workspace.notebook.settings,
    connectionId: undefined,
    model: undefined,
    ...activeAi(),
  },
) {
  if (!settings.connectionId || !settings.model)
    throw new Error(
      t("Connect an AI in AI connections, then choose it in Settings."),
    );
  return {
    connectionId: settings.connectionId,
    model: settings.model,
    effort: settings.effort || "auto",
    sourceIds: [...state.selected],
    ...(settings.embeddingConnectionId
      ? {
          embeddingConnectionId: settings.embeddingConnectionId,
          embeddingModel: settings.embeddingModel,
        }
      : {}),
  };
}
/** Ask the AI in use for three questions grounded in the selected sources; the server keeps them on the notebook. */
async function suggestQuestions() {
  const selection = aiSelection();
  if (!selection.sourceIds.length)
    throw new Error("Select at least one ready source.");
  await api("notebooks/" + state.activeNotebook + "/generate", {
    method: "POST",
    data: { ...selection, kind: "questions" },
  });
  await openNotebook(state.activeNotebook);
  toast("Questions ready.");
}
async function uploadFile(file) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Maximum file size is 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return api("notebooks/" + state.activeNotebook + "/sources", {
    method: "POST",
    data: { name: file.name, base64: btoa(binary) },
  });
}
function openDriveDraft(message) {
  if (!state.drive.connected) {
    nav("connections");
    toast("Connect Google Drive first.");
    return;
  }
  const notebook = state.activeNotebook;
  const title = el("input", { maxlength: 160 });
  const documentLink = el("input", { type: "url", maxlength: 2000 });
  const original = el("textarea", { rows: 2, maxlength: 4000 });
  const prompt = el("textarea", { value: message, rows: 4, maxlength: 8000 });
  const status = el("div", { role: "status" });
  const make = button("Generate Drive draft", () => {
    make.disabled = true;
    status.replaceChildren(busy("Working…"));
    void action(async () => {
      const draft = await api("notebooks/" + notebook + "/drive-draft", {
        method: "POST",
        data: { ...aiSelection(), title: title.value, document: documentLink.value, original: original.value, prompt: prompt.value },
      });
      if (!$("#dialog").contains(make) || !$("#dialog").open) return;
      const apply = button("Save to Google Drive", () => {
        apply.disabled = true;
        void action(async () => {
          const { url } = await api("drive/apply", { method: "POST", data: { id: draft.id } });
          if (!$("#dialog").contains(apply) || !$("#dialog").open) return;
          modal("Saved to Google Drive", el("div", { class: "stack" },
            el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, t("Open Google Doc")),
          ));
        });
      }, "primary");
      modal("Review Drive draft", el("div", { class: "stack" },
        el("h3", {}, draft.title),
        el("p", {}, t(draft.original ? "Replace the passage below." : draft.editing ? "Append to this document." : "Create a Google Doc in My Drive.")),
        draft.original ? el("pre", { style: "white-space: pre-wrap" }, draft.original) : null,
        el("textarea", { rows: 10, readonly: true, "aria-label": t("Draft text"), value: draft.text }),
        apply,
      ), true);
    }).finally(() => {
      make.disabled = false;
      status.replaceChildren();
    });
  }, "primary");
  modal("Google Drive", el("div", { class: "stack" },
    field("New document title", title),
    field("Or paste a Google Docs link to edit", documentLink),
    field("Exact text to replace (leave blank to append)", original),
    field("Instructions for the draft", prompt),
    el("p", { class: "muted small" }, t("Folio sends selected source passages and text from the linked document to your active AI provider when you draft.")),
    status,
    make,
  ), true);
}

function uploadModal() {
  const files = el("input", {
      type: "file",
      multiple: true,
      accept: ".pdf,.docx,.pptx,.epub,.txt,.md,.csv",
      "aria-label": t("Choose files"),
    }),
    status = el("div"),
    name = el("input", { value: "Study notes.md", maxlength: 200 }),
    text = el("textarea", {
      rows: 7,
      placeholder: "Paste material you have permission to use.",
    }),
    link = el("input", {
      type: "url",
      maxlength: 2000,
      placeholder: t("Web page, PDF, YouTube or Reddit link"),
      "aria-label": t("Web address"),
    });
  const query = el("input", { maxlength: 500, placeholder: t("Search terms") });
  const subreddit = el("input", { maxlength: 32, placeholder: "LocalLLaMA" });
  const addWebSource = (trigger, data) => {
    trigger.disabled = true;
    status.replaceChildren(busy("Working…"));
    void action(async () => {
      if (!data.url && !data.redditQuery)
        throw new Error(t("Enter a web address or Reddit search terms."));
      await api("notebooks/" + state.activeNotebook + "/sources", {
        method: "POST",
        data,
      });
      $("#dialog").close();
      await openNotebook(state.activeNotebook);
      toast("Upload queued.");
    }).finally(() => {
      trigger.disabled = false;
      status.replaceChildren();
    });
  };
  const addLink = button("Add web page", () => addWebSource(addLink, { url: link.value.trim() }));
  const addReddit = button("Add Reddit results", () => addWebSource(addReddit, {
    redditQuery: query.value.trim(),
    subreddit: subreddit.value.trim(),
  }));
  const upload = button(
    "Add sources",
    () => {
      upload.disabled = true;
      status.replaceChildren(busy("Working…"));
      void action(async () => {
        if (!files.files.length) throw new Error("Choose at least one file.");
        for (const file of files.files) await uploadFile(file);
        $("#dialog").close();
        await openNotebook(state.activeNotebook);
        toast("Upload queued.");
      }).finally(() => {
        upload.disabled = false;
        status.replaceChildren();
      });
    },
    "primary",
    "upload",
  );
  modal(
    "Add sources",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        { class: "muted" },
        t("Add PDF, Word, PowerPoint, EPUB, TXT, Markdown or CSV files (10 MB each)."),
      ),
      files,
      status,
      upload,
      el("hr"),
      el("h3", {}, t("Add from the web")),
      el(
        "p",
        { class: "muted small" },
        t(
          "Paste a public article, file, YouTube video or Reddit link. Folio reads YouTube transcripts and public Reddit posts and comments.",
        ),
      ),
      field("Web address", link),
      addLink,
      el("h3", {}, t("Search Reddit")),
      field("Search terms", query),
      field("Subreddit (optional)", subreddit),
      addReddit,
      el("hr"),
      el("h3", {}, t("Paste source text")),
      field("Title", name),
      field("Text / Markdown", text),
      button("Add text as source", () =>
        action(async () => {
          if (!text.value.trim()) throw new Error("Enter source text first.");
          await uploadFile(
            new File(
              [text.value],
              /\.(txt|md|csv)$/i.test(name.value)
                ? name.value
                : name.value + ".md",
              { type: "text/markdown" },
            ),
          );
          $("#dialog").close();
          await openNotebook(state.activeNotebook);
          toast("Upload queued.");
        }),
      ),
      el(
        "p",
        { class: "muted small" },
        "Scanned PDFs need OCR first. Images, audio, video and cloud imports are planned. Import only files you are authorized to process.",
      ),
    ),
  );
}
async function loadSample() {
  const sample =
    "# Cell biology — labeled sample material\n\n## Cells\nCells are the basic structural and functional units of living organisms. A cell membrane regulates the movement of substances into and out of the cell.\n\n## Nucleus\nThe nucleus contains genetic material (DNA) and helps regulate cell activities. Prokaryotic cells do not have a membrane-bound nucleus.\n\n## Mitochondria\nMitochondria are sites of aerobic cellular respiration. They transfer energy from nutrients into ATP, which powers cellular processes.\n\n## Plant cells\nPlant cells typically have a cellulose cell wall, chloroplasts and a large central vacuole. Chloroplasts contain chlorophyll, which absorbs light energy for photosynthesis.\n\n## Photosynthesis\nPhotosynthesis uses light energy to convert carbon dioxide and water into sugars, releasing oxygen. Respiration and photosynthesis are distinct processes. Plants carry out cellular respiration as well as photosynthesis.\n";
  await uploadFile(
    new File([sample], "Cell biology — sample.md", { type: "text/markdown" }),
  );
  await openNotebook(state.activeNotebook);
  toast("Upload queued.");
}
async function sourceModal(id) {
  const data = await api("sources/" + id);
  const passages = el("div", { class: "stack source-reader" });
  const search = el("input", {
    type: "search",
    "aria-label": t("Search in source"),
    placeholder: t("Search in source"),
    onInput: () => showPassages(search.value),
  });
  function showPassages(query) {
    const matches = data.chunks.filter((c) =>
      c.text.toLowerCase().includes(query.trim().toLowerCase()),
    );
    passages.replaceChildren(
      ...matches.map((c) =>
        el(
          "section",
          { class: "stack" },
          el(
            "h3",
            {},
            t(c.page ? "Page" : "Section") + " " + (c.page || c.ordinal + 1),
          ),
          el("div", { class: "source-excerpt" }, c.text),
        ),
      ),
    );
    if (!matches.length)
      passages.append(el("p", { class: "muted" }, t("No matching passages.")));
  }
  showPassages("");
  function askSource(summary = false) {
    state.selected = new Set([id]);
    state.panel = "chat";
    state.collapsed.delete("sources");
    $("#dialog").close();
    render();
    const input = $(".composer textarea");
    input.value = summary
      ? (state.locale === "pt-BR"
          ? "Resuma esta fonte com citações: "
          : "Summarize this source with citations: ") + data.source.title
      : "";
    state.drafts.set(state.activeNotebook, input.value);
    input.focus();
  }
  modal(
    data.source.title,
    el(
      "div",
      { class: "stack" },
      el(
        "div",
        { class: "row wrap" },
        el(
          "span",
          { class: "badge" },
          t(data.source.status[0].toUpperCase() + data.source.status.slice(1)),
        ),
        el(
          "a",
          {
            href: "/api/sources/" + id + "/file",
            class: "button small",
            download: "",
          },
          t("Download original"),
        ),
        ["failed", "cancelled"].includes(data.source.status)
          ? button(
              "Try again",
              () =>
                action(async () => {
                  await api("sources/" + id + "/retry", {
                    method: "POST",
                    data: {},
                  });
                  $("#dialog").close();
                  await openNotebook(state.activeNotebook);
                }),
              "small",
            )
          : null,
        ["queued", "processing"].includes(data.source.status)
          ? button(
              "Cancel",
              () =>
                action(async () => {
                  await api("sources/" + id + "/cancel", {
                    method: "POST",
                    data: {},
                  });
                  $("#dialog").close();
                  await openNotebook(state.activeNotebook);
                }),
              "small",
            )
          : null,
      ),
      data.source.error
        ? el("p", { class: "notice error" }, data.source.error)
        : null,
      data.source.status === "ready"
        ? el(
            "div",
            { class: "source-guide stack" },
            el("h3", {}, t("Source")),
            el(
              "div",
              { class: "row wrap" },
              button(
                "Ask about this source",
                () => askSource(),
                "small",
                "spark",
              ),
              button(
                "Summarize this source",
                () => askSource(true),
                "small",
                "file",
              ),
            ),
            el(
              "small",
              { class: "muted" },
              t("Only this source will be selected for your next question."),
            ),
          )
        : null,
      data.chunks.length ? search : null,
      data.chunks.length
        ? passages
        : el("p", { class: "muted" }, t("Processing")),
    ),
  );
}
let chatAbort;
async function sendMessage(
  message,
  input = null,
  mode = "strict",
  send = null,
  useWeb = true,
) {
  if (state.busy) return;
  let selection;
  try {
    selection = aiSelection();
    // A YouTube or Reddit link can supply its own evidence.
    if (
      !selection.sourceIds.length &&
      (!useWeb ||
        !/youtu\.?be|https?:\/\/(?:[a-z]+\.)?(?:reddit\.com|redd\.it)(?=[/:\s]|$)|^reddit(?:\/[a-z0-9_]+)?:/i.test(
          message.trim(),
        ))
    )
      throw new Error("Select at least one ready source.");
  } catch (error) {
    toast(error.message, true);
    return;
  }
  const notebookId = state.activeNotebook;
  state.busy = true;
  chatAbort = new AbortController();
  if (send) send.disabled = true;
  if (input) input.value = "";
  state.drafts.delete(state.activeNotebook);
  $("#chat-welcome")?.remove();
  const list = $("#messages");
  list.append(el("article", { class: "message user" }, message));
  const output = el(
    "article",
    { class: "message assistant" },
    busy("Working…"),
  );
  list.append(output);
  output.scrollIntoView({ block: "end" });
  const cancel = button(
    "Cancel generation",
    () => chatAbort.abort(),
    "quiet small",
  );
  output.append(cancel);
  let responseText = "",
    done = false;
  try {
    const response = await fetch("/api/notebooks/" + notebookId + "/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrf,
      },
      body: JSON.stringify({ ...selection, message, mode, useWeb }),
      signal: chatAbort.signal,
    });
    if (!response.ok) throw new Error((await response.json()).error);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let pending = "";
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      pending += decoder.decode(value, { stream: true });
      let index;
      while ((index = pending.indexOf("\n\n")) !== -1) {
        const frame = pending.slice(0, index);
        pending = pending.slice(index + 2);
        if (!frame.startsWith("data:")) continue;
        const event = JSON.parse(frame.slice(5));
        if (event.error) throw new Error(event.error);
        // New sources are listed by the notebook refresh below; select them now.
        if (event.sourcesChanged && location.hash === "#notebook/" + notebookId)
          for (const id of event.sourceIds) state.selected.add(id);
        if (event.text && !event.done) {
          responseText += event.text;
          output.replaceChildren(
            el(
              "div",
              { class: "message-meta" },
              icon("spark"),
              "Folio / " + t("Working…"),
            ),
            el("div", { class: "prose" }, responseText),
            cancel,
          );
        }
        if (event.done) {
          done = true;
          if (event.warning) toast(event.warning);
        }
      }
    }
    if (!done) throw new Error("The response ended early. Retry generation.");
    if (location.hash === "#notebook/" + notebookId)
      await openNotebook(notebookId);
  } catch (error) {
    output.replaceChildren(
      el(
        "div",
        { class: "notice error" },
        error.name === "AbortError"
          ? "Generation cancelled. Partial output was not saved."
          : error.message,
      ),
    );
  } finally {
    state.busy = false;
    if (send) send.disabled = false;
    const button = $(".composer button[type=submit]");
    if (button) button.disabled = false;
  }
}
const reportFormats = {
  "Study guide":
    "Create a study guide with definitions, examples, common mistakes, review questions, and a glossary.",
  "Briefing document":
    "Create a concise briefing document with an executive summary, key findings, supporting evidence, and open questions.",
  FAQ: "Create a frequently asked questions document. Use a question heading and a clear answer with citations for each topic.",
  Timeline:
    "Create a chronological timeline using only dates and events explicitly supported by the sources. Say when dates are not provided; do not invent dates or ordering.",
  Glossary:
    "Create a glossary of every key term in the sources, in alphabetical order. Give each term a one- or two-sentence definition in the sources' own wording, with a citation.",
  "Comparison document":
    "Create a comparison document for the concepts in the sources that are easy to confuse. Use Markdown tables that set out the exact differences, then explain each pair in one short paragraph with citations.",
};
function reportsModal() {
  modal(
    "Reports",
    el(
      "div",
      { class: "stack" },
      el("p", { class: "muted" }, t("Choose a format for your sources")),
      el(
        "div",
        { class: "report-formats" },
        Object.keys(reportFormats).map((format) =>
          button(
            format,
            () => generateModal("guide", { format }),
            "report-format",
            "file",
          ),
        ),
      ),
    ),
  );
}
const quizTypes = [
  ["choice", "Multiple choice"],
  ["multi", "Multiple select"],
  ["blank", "Fill in the blank"],
  ["short", "Short answer"],
];
// Explanation languages, with the speech language of each.
const languageCodes = {
  English: "en",
  "Português (Brasil)": "pt",
  Español: "es",
  Français: "fr",
  Deutsch: "de",
  Italiano: "it",
};
const outputLanguages = Object.keys(languageCodes);
/** A row of single-choice chips; `set` changes the choice without calling back. */
function chipGroup(label, choices, value, onPick) {
  const group = el("div", {
    class: "chip-row",
    role: "group",
    "aria-label": t(label),
  });
  const sync = () => {
    for (const chip of group.children)
      chip.setAttribute(
        "aria-pressed",
        String(chip.dataset.value === String(value)),
      );
  };
  for (const [choice, name] of choices)
    group.append(
      el(
        "button",
        {
          type: "button",
          class: "choice-chip",
          "data-value": choice,
          onClick: () => {
            value = choice;
            sync();
            onPick(choice);
          },
        },
        name,
      ),
    );
  sync();
  return Object.assign(group, {
    set: (next) => {
      value = next;
      sync();
    },
  });
}
const genGroup = (label, ...nodes) =>
  el(
    "div",
    { class: "gen-group" },
    el("span", { class: "gen-label" }, t(label)),
    ...nodes,
  );
function generateModal(kind, options = {}) {
  if (!state.connections.length) {
    modal(
      "Connect a provider",
      el(
        "div",
        { class: "stack" },
        el(
          "p",
          {},
          t("Connect an authorized provider to generate study resources."),
        ),
        button(
          "AI connections",
          () => {
            $("#dialog").close();
            nav("connections");
          },
          "primary",
        ),
      ),
    );
    return;
  }
  // Flashcards and quizzes get chip controls and remember the last choices.
  const study = kind === "flashcards" || kind === "quiz",
    maxCount = kind === "flashcards" ? 50 : 30,
    prefKey = "folio-generate-" + kind;
  let saved = {};
  try {
    saved = JSON.parse(stored(prefKey, "{}")) || {};
  } catch {
    saved = {};
  }
  const pick = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;
  let level = pick(
      options.difficulty || saved.difficulty,
      ["easy", "medium", "hard", "adaptive"],
      "medium",
    ),
    cardFocus = pick(
      saved.cardFocus,
      ["definitions", "concepts", "qa", "exam", "mixed"],
      "mixed",
    );
  const types = new Set(
    (Array.isArray(saved.questionTypes) ? saved.questionTypes : []).filter(
      (id) => quizTypes.some(([known]) => known === id),
    ),
  );
  if (!types.size) types.add("choice");
  const typeChips = el(
    "div",
    { class: "chip-row", role: "group", "aria-label": t("Question types") },
    quizTypes.map(([id, name]) =>
      el(
        "button",
        {
          type: "button",
          class: "choice-chip",
          "aria-pressed": String(types.has(id)),
          onClick: (e) => {
            // At least one type stays chosen.
            if (types.has(id) && types.size === 1) return;
            types.has(id) ? types.delete(id) : types.add(id);
            e.currentTarget.setAttribute("aria-pressed", String(types.has(id)));
          },
        },
        t(name),
      ),
    ),
  );
  const count = el("input", {
      type: "number",
      min: 1,
      max: study ? maxCount : 30,
      value: study ? Math.min(maxCount, Number(saved.count) || 10) : 8,
    }),
    difficulty = el(
      "select",
      {},
      ["beginner", "intermediate", "advanced"].map((v) =>
        el("option", { value: v, selected: v === "intermediate" }, v),
      ),
    ),
    language = el(
      "select",
      {},
      outputLanguages.map((v) =>
        el(
          "option",
          {
            value: v,
            selected: v === state.workspace.notebook.settings.language,
          },
          v,
        ),
      ),
    ),
    focus = el("textarea", {
      rows: 3,
      maxlength: kind === "guide" || kind === "audio" ? 750 : 1000,
      placeholder: "Chapter, topic, level, exam, depth…",
      value: options.instructions || "",
    }),
    status = el("div");
  const notebookId = state.activeNotebook;
  const selectedModel = {
    ...state.workspace.notebook.settings,
    connectionId: undefined,
    model: undefined,
    ...activeAi(),
  };
  const model = modelSelect((connectionId, model) => {
    Object.assign(selectedModel, { connectionId, model });
  }, selectedModel);
  const format = el(
    "select",
    {},
    Object.keys(reportFormats).map((name) =>
      el(
        "option",
        { value: name, selected: name === (options.format || "Study guide") },
        t(name),
      ),
    ),
  );
  const audioFormat = el(
    "select",
    {},
    Object.keys(audioFormats).map((name) =>
      el("option", { value: name }, t(name)),
    ),
  );
  const sourceNote = el("p", { class: "muted small" }),
    ready = state.workspace.sources.filter((s) => s.status === "ready"),
    notes = state.workspace.artifacts.filter((n) => n.kind === "note"),
    pickedNotes = new Set(),
    showNote = () =>
      sourceNote.replaceChildren(
        `${state.selected.size} ${t("Sources").toLowerCase()} selected. ${t("Your material is sent only to the provider you select.")} API charges may apply; no provider fallback is automatic.`,
      );
  showNote();
  const sourceList = el(
    "div",
    { class: "gen-sources" },
    ready.map((s) =>
      el(
        "label",
        { class: "gen-check" },
        el("input", {
          type: "checkbox",
          checked: state.selected.has(s.id),
          "aria-label": t("Use") + " " + s.title,
          onChange: (e) => {
            if (e.target.checked) state.selected.add(s.id);
            else state.selected.delete(s.id);
            syncSelection();
            showNote();
          },
        }),
        el("span", {}, s.title),
      ),
    ),
    notes.length ? el("span", { class: "gen-label" }, t("Notes")) : null,
    notes.map((n) =>
      el(
        "label",
        { class: "gen-check" },
        el("input", {
          type: "checkbox",
          "data-note": n.id,
          "aria-label": t("Use note") + " " + n.title,
          onChange: (e) => {
            if (e.target.checked) pickedNotes.add(n.id);
            else pickedNotes.delete(n.id);
          },
        }),
        el("span", {}, n.title),
      ),
    ),
  );
  sourceList.hidden = true;
  const scope = chipGroup(
    "Sources",
    [
      ["all", t("Entire notebook")],
      ["some", t("Selected sources")],
    ],
    "all",
    (value) => {
      if (value === "all") {
        state.selected = new Set(ready.map((s) => s.id));
        pickedNotes.clear();
        for (const box of sourceList.querySelectorAll("input"))
          box.checked = !box.dataset.note;
        syncSelection();
        showNote();
      }
      sourceList.hidden = value === "all";
    },
  );
  const countChips = chipGroup(
    "Number of items",
    (kind === "flashcards" ? [5, 10, 20, 30, 50] : [5, 10, 20, 30]).map((n) => [
      n,
      String(n),
    ]),
    Number(count.value),
    (value) => {
      count.value = value;
    },
  );
  count.addEventListener("input", () => countChips.set(Number(count.value)));
  const levelHint = el("small", { class: "muted" });
  const levelChips = chipGroup(
    "Difficulty",
    [
      ["easy", t("Easy")],
      ["medium", t("Medium")],
      ["hard", t("Hard")],
      ["adaptive", t("Adaptive")],
    ],
    level,
    (value) => {
      level = value;
      levelHint.textContent =
        value === "adaptive" ? t("Adaptive targets your weak concepts.") : "";
    },
  );
  levelHint.textContent =
    level === "adaptive" ? t("Adaptive targets your weak concepts.") : "";
  const focusChips = chipGroup(
    "Focus",
    [
      ["definitions", t("Definitions")],
      ["concepts", t("Key concepts")],
      ["qa", t("Questions & answers")],
      ["exam", t("Exam preparation")],
      ["mixed", t("Mixed")],
    ],
    cardFocus,
    (value) => {
      cardFocus = value;
    },
  );
  const toggle = (label, hint, on) =>
    el(
      "label",
      { class: "gen-check" },
      el("input", { type: "checkbox", role: "switch", checked: on }),
      el("span", {}, t(label), el("small", {}, t(hint))),
    );
  const spaced = toggle(
      "Spaced repetition",
      "Schedule each card for review with FSRS.",
      saved.spaced !== false,
    ),
    explanations = toggle(
      "Include explanations",
      "Add a short explanation to every card.",
      saved.explanations !== false,
    ),
    fromDeck = options.fromDeck
      ? el(
          "label",
          { class: "gen-check" },
          el("input", { type: "checkbox", role: "switch", checked: true }),
          el(
            "span",
            {},
            `${t("Based on deck:")} ${options.deckTitle || ""}`,
            el("small", {}, t("Questions come from this deck's cards.")),
          ),
        )
      : null;
  const submit = el(
    "button",
    { class: "button primary", type: "submit" },
    t("Generate"),
  );
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        submit.disabled = true;
        status.replaceChildren(busy("Working…"));
        void action(async () => {
          // A ticked note is snapshotted into a source first, as "Convert to
          // source" does; a note whose snapshot is already a source is reused.
          for (const id of pickedNotes) {
            const file = noteSnapshot(await api("artifacts/" + id));
            let source = state.workspace.sources.find(
              (s) => s.title === file.name,
            );
            source ??= await uploadFile(file);
            for (let i = 0; i < 80; i++) {
              const { source: current } = await api("sources/" + source.id);
              if (current.status === "ready") break;
              if (["failed", "error"].includes(current.status) || i === 79)
                throw new Error("A note could not be added as a source.");
              await new Promise((done) => setTimeout(done, 750));
            }
            state.selected.add(source.id);
          }
          const selection = aiSelection(selectedModel);
          if (!selection.sourceIds.length)
            throw new Error("Select at least one ready source.");
          const total = Number(count.value);
          if (
            study &&
            !(Number.isInteger(total) && total >= 1 && total <= maxCount)
          )
            throw new Error(`Choose between 1 and ${maxCount} items.`);
          if (study)
            store(
              prefKey,
              JSON.stringify({
                count: total,
                difficulty: level,
                cardFocus,
                questionTypes: [...types],
                spaced: spaced.querySelector("input").checked,
                explanations: explanations.querySelector("input").checked,
              }),
            );
          await saveModel(selection.connectionId, selection.model);
          await saveEffort(selection.effort, notebookId);
          const result = await api("notebooks/" + notebookId + "/generate", {
            method: "POST",
            data: {
              ...selection,
              kind,
              count: total,
              difficulty: study ? level : difficulty.value,
              ...(study ? { cardFocus } : {}),
              ...(kind === "quiz" ? { questionTypes: [...types] } : {}),
              ...(kind === "flashcards"
                ? {
                    spaced: spaced.querySelector("input").checked,
                    explanations: explanations.querySelector("input").checked,
                  }
                : {}),
              ...(fromDeck?.querySelector("input").checked
                ? { fromDeck: options.fromDeck }
                : {}),
              focus:
                (kind === "guide" ? reportFormats[format.value] + "\n" : "") +
                (kind === "audio"
                  ? audioFormats[audioFormat.value] + "\n"
                  : "") +
                focus.value,
              language: language.value,
            },
          });
          await openNotebook(notebookId);
          $("#dialog").close();
          await openArtifact(result.id);
        }).finally(() => {
          submit.disabled = false;
          status.replaceChildren();
        });
      },
    },
    field("Choose a model", model),
    // A div, not a label: a label would pass clicks on its text to the Auto button.
    el(
      "div",
      { class: "effort-field" },
      el("span", {}, t("Effort")),
      effortCard(
        selectedModel.effort,
        (value) => {
          selectedModel.effort = value;
        },
        selectedModel.model,
      ),
    ),
    kind === "guide" ? field("Report format", format) : null,
    kind === "audio" ? field("Audio format", audioFormat) : null,
    study
      ? [
          fromDeck,
          genGroup("Sources", scope, sourceList),
          genGroup(
            kind === "flashcards" ? "Number of cards" : "Number of questions",
            el(
              "div",
              { class: "gen-count" },
              countChips,
              field("Custom", count),
            ),
          ),
          genGroup("Difficulty", levelChips, levelHint),
          genGroup("Focus", focusChips),
          kind === "quiz" ? genGroup("Question types", typeChips) : null,
          kind === "flashcards"
            ? el("div", { class: "gen-switches" }, spaced, explanations)
            : null,
          field("Explanation language", language),
          field("Custom instructions (optional)", focus),
        ]
      : [
          el(
            "div",
            { class: "form-grid" },
            field("Number of items", count),
            field("Difficulty", difficulty),
            field("Explanation language", language),
          ),
          field("Focus (optional)", focus),
        ],
    sourceNote,
    status,
    el(
      "div",
      { class: "dialog-actions" },
      button("Cancel", () => $("#dialog").close()),
      submit,
    ),
  );
  modal("Generate from sources", form);
}
function noteModal(note = null) {
  const title = el("input", {
      required: true,
      maxlength: 200,
      value: note?.title || "",
    }),
    text = el("textarea", {
      class: "editor",
      required: true,
      maxlength: 60000,
      value: note?.content?.markdown || note?.markdown || "",
    });
  const preview = el("div");
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          if (note?.id)
            await api("artifacts/" + note.id, {
              method: "PATCH",
              data: { title: title.value, markdown: text.value },
            });
          else
            await api("notebooks/" + state.activeNotebook + "/notes", {
              method: "POST",
              data: { title: title.value, markdown: text.value },
            });
          $("#dialog").close();
          await openNotebook(state.activeNotebook);
          toast("Saved.");
        });
      },
    },
    field("Title", title),
    field("Markdown content", text),
    button(
      "Preview",
      () => preview.replaceChildren(markdown(text.value)),
      "small",
    ),
    preview,
    el(
      "div",
      { class: "dialog-actions" },
      button(
        "Export",
        () => download((title.value || "note") + ".md", text.value),
        "",
        "download",
      ),
      el("button", { class: "button primary", type: "submit" }, t("Save note")),
    ),
  );
  modal("Note", form);
}
async function openArtifact(id) {
  const a = await api("artifacts/" + id);
  if (a.kind === "flashcards") return flashcardModal(a);
  if (a.kind === "quiz") return quizModal(a);
  if (a.kind === "mindmap") return mindmapModal(a);
  if (a.kind === "slides") return slidesModal(a);
  if (a.kind === "audio") return audioModal(a);
  if (a.kind === "infographic") return infographicModal(a);
  const body = el(
    "div",
    { class: "stack" },
    el(
      "div",
      { class: "row wrap" },
      a.kind === "note" || a.kind === "guide"
        ? editOnly(button("Edit", () => noteModal(a), "small", "edit"))
        : null,
      button("Export", () => exportArtifact(a), "small", "download"),
      ["note", "guide"].includes(a.kind)
        ? editOnly(
            button(
              "Convert to source",
              () => convertToSource(a),
              "small",
              "plus",
            ),
          )
        : null,
      editOnly(
        button(
          "Delete",
          () =>
            confirmAction("Delete", a.title, async () => {
              await api("artifacts/" + a.id, { method: "DELETE" });
              await openNotebook(state.activeNotebook);
            }),
          "small danger",
          "trash",
        ),
      ),
    ),
  );
  if (a.kind === "table") {
    body.append(
      el(
        "div",
        { class: "scroll" },
        el(
          "table",
          { class: "data-table" },
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              a.content.columns.map((c) => el("th", { scope: "col" }, c)),
            ),
          ),
          el(
            "tbody",
            {},
            a.content.rows.map((row) =>
              el(
                "tr",
                {},
                row.map((c) => el("td", {}, c)),
              ),
            ),
          ),
        ),
      ),
    );
  } else {
    if (a.content.coverage)
      body.append(
        el(
          "p",
          { class: "notice" },
          `${a.content.coverage.sampledChunks}/${a.content.coverage.totalChunks} chunks sampled. ${a.content.coverage.notice}`,
        ),
      );
    body.append(markdown(a.content.markdown, a.citations));
  }
  body.append(citationButtons(a.citations));
  modal(a.title, body);
}
/** The Markdown file a note becomes when it is converted to a source. */
function noteSnapshot(a) {
  const content =
    `# ${a.title}\n\nNote snapshot (may contain AI-generated content; verify against the originals).\n\n${a.content.markdown}\n\n` +
    a.citations
      .map(
        (c) =>
          `[${c.id}] ${c.title} (${c.page ? "page " + c.page : "section " + c.section})`,
      )
      .join("\n");
  return new File([content], a.title.slice(0, 180) + ".md", {
    type: "text/markdown",
  });
}
function convertToSource(a) {
  confirmAction(
    "Convert to source",
    t(
      "A separate copy is added to Sources. Later edits to this note will not update the copy.",
    ),
    async () => {
      await uploadFile(noteSnapshot(a));
      await openNotebook(state.activeNotebook);
      state.panel = "sources";
      render();
      toast("Upload queued.");
    },
    "Convert to source",
  );
}
/** One-page visual summary. Built from text nodes, so source text never becomes HTML. */
function infographicPoster(a, standalone = false) {
  const c = a.content;
  const [titleTag, sectionTag] = standalone ? ["h1", "h2"] : ["h3", "h4"];
  const cite = (refs) =>
    refs?.length
      ? el(
          "sup",
          { class: "ig-refs" },
          " " + refs.map((r) => `[${r}]`).join(""),
        )
      : null;
  return el(
    "article",
    { class: "ig" },
    el(
      "header",
      { class: "ig-head" },
      el("small", {}, t("Infographic")),
      el(titleTag, {}, c.title),
      c.subtitle ? el("p", {}, c.subtitle) : null,
    ),
    c.stats.length
      ? el(
          "div",
          { class: "ig-stats" },
          c.stats.map((s) =>
            el(
              "div",
              { class: "ig-stat" },
              el("strong", {}, s.value),
              el("span", {}, s.label, cite(s.refs)),
            ),
          ),
        )
      : null,
    el(
      "div",
      { class: "ig-sections" },
      c.sections.map((s, i) =>
        el(
          "section",
          { class: "ig-section" },
          el("span", { class: "ig-num", "aria-hidden": "true" }, String(i + 1)),
          el(sectionTag, {}, s.heading, cite(s.refs)),
          el(
            "ul",
            {},
            s.points.map((point) => el("li", {}, point)),
          ),
        ),
      ),
    ),
    c.takeaway
      ? el(
          "p",
          { class: "ig-takeaway" },
          el("strong", {}, t("Key takeaway") + ": "),
          c.takeaway,
        )
      : null,
  );
}
function infographicModal(a) {
  modal(
    a.title,
    el(
      "div",
      { class: "stack" },
      el(
        "div",
        { class: "row wrap" },
        button("Export HTML", () => exportArtifact(a), "small", "download"),
      ),
      infographicPoster(a),
      citationButtons(a.citations),
    ),
    true,
  );
}
const infographicCss =
  "body{font:17px/1.55 system-ui,sans-serif;margin:0;background:#eef1fa;color:#202634}main{max-width:860px;margin:auto;padding:24px}.ig{background:#fff;border-radius:24px;padding:36px}.ig-head small{letter-spacing:.12em;text-transform:uppercase;color:#4250b3;font-weight:600}.ig-head h1{font-size:2.1em;line-height:1.15;margin:.2em 0}.ig-head p{color:#5b6472;margin:0}.ig-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:24px 0}.ig-stat{background:#e9ebfa;border-radius:16px;padding:16px}.ig-stat strong{display:block;font-size:1.7em;color:#2f3c9e;overflow-wrap:anywhere}.ig-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.ig-section{border:1px solid #dfe3ee;border-radius:16px;padding:16px;break-inside:avoid}.ig-num{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#2f3c9e;color:#fff;font-weight:700;font-size:.85em}.ig-section h2{font-size:1.1em;margin:.5em 0 .3em}.ig-section ul{margin:0;padding-left:1.1em}.ig-takeaway{background:#202634;color:#fff;border-radius:16px;padding:16px;margin:24px 0 0}.ig-refs{color:#69717e;font-size:.7em}footer{font-size:.75em;color:#4a5261;margin-top:24px}@media print{body{background:#fff}main{padding:0}.ig{border-radius:0;padding:0}}";
function slidesModal(a) {
  let index = 0;
  const slide = el("div", { class: "slide-canvas" });
  const notes = el(
    "details",
    { class: "slide-notes" },
    el("summary", {}, t("Speaker notes")),
  );
  const count = el("span", { class: "muted small", role: "status" });
  const previous = button(
    "Previous",
    () => {
      index--;
      show();
    },
    "small",
  );
  const next = button(
    "Next",
    () => {
      index++;
      show();
    },
    "small",
  );
  const refs = el("div");
  function show() {
    const current = a.content.slides[index];
    slide.replaceChildren(
      el("small", { class: "slide-label" }, a.title),
      el("h2", {}, current.title),
      el(
        "ul",
        {},
        current.bullets.map((b) => el("li", {}, b)),
      ),
    );
    notes.replaceChildren(
      el("summary", {}, t("Speaker notes")),
      el("p", {}, current.speakerNotes),
    );
    refs.replaceChildren(
      citationButtons(a.citations.filter((c) => current.refs.includes(c.id))),
    );
    count.textContent = `${index + 1} / ${a.content.slides.length}`;
    previous.disabled = index === 0;
    next.disabled = index === a.content.slides.length - 1;
  }
  show();
  modal(
    a.title,
    el(
      "div",
      { class: "stack" },
      el(
        "div",
        { class: "row between wrap" },
        el("div", { class: "row" }, previous, count, next),
        button("Download slides", () => exportArtifact(a), "small", "download"),
      ),
      slide,
      notes,
      refs,
      button(
        "Delete",
        () =>
          confirmAction("Delete", a.title, async () => {
            await api("artifacts/" + a.id, { method: "DELETE" });
            await openNotebook(state.activeNotebook);
          }),
        "small danger",
        "trash",
      ),
    ),
    true,
  );
}
function citationButtons(citations) {
  return el(
    "div",
    {},
    citations.map((c) =>
      el(
        "button",
        { class: "citation-source", onClick: () => citationModal(c) },
        `[${c.id}] ${c.title} / ${c.page ? "p. " + c.page : "§ " + c.section}`,
      ),
    ),
  );
}
const csvCell = (value) =>
  '"' +
  String(value ?? "")
    .replace(/^[=+@\-\t\r]/, (m) => "'" + m)
    .replaceAll('"', '""') +
  '"';
function exportArtifact(a) {
  if (a.kind === "audio")
    return download(
      a.title + " — transcript.md",
      audioTranscript(a),
      "text/markdown",
    );
  if (a.kind === "infographic") {
    const doc = document.implementation.createHTMLDocument(a.title);
    doc.documentElement.lang = state.locale;
    const meta = doc.createElement("meta");
    meta.setAttribute("charset", "utf-8");
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    const style = doc.createElement("style");
    style.textContent = infographicCss;
    doc.head.append(meta, viewport, style);
    doc.body.append(
      el(
        "main",
        {},
        infographicPoster(a, true),
        el(
          "footer",
          {},
          a.citations.map((c) =>
            el(
              "p",
              {},
              `[${c.id}] ${c.title} (${c.page ? "page " + c.page : "section " + c.section}): ${c.text}`,
            ),
          ),
        ),
      ),
    );
    return download(
      a.title + ".html",
      "<!doctype html>\n" + doc.documentElement.outerHTML,
      "text/html;charset=utf-8",
    );
  }
  if (a.kind === "slides") {
    // Build with text nodes so source text can never become executable HTML.
    const doc = document.implementation.createHTMLDocument(a.title);
    doc.documentElement.lang = state.locale;
    const meta = doc.createElement("meta");
    meta.setAttribute("charset", "utf-8");
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    const style = doc.createElement("style");
    style.textContent =
      "body{font:20px/1.6 system-ui;margin:0;background:#eef1fa;color:#202634}main{max-width:1050px;margin:auto;padding:24px}section{background:white;border-radius:20px;padding:7%;margin:24px 0;min-height:480px;break-after:page}h1{font-size:2.2em;line-height:1.2}li{margin:1em 0}footer,aside{font-size:.75em}aside{margin-top:3em}@media print{body{background:white}main{padding:0}section{margin:0;border-radius:0;min-height:90vh}}";
    doc.head.append(meta, viewport, style);
    const main = el(
      "main",
      {},
      a.content.slides.map((slide, i) =>
        el(
          "section",
          {},
          el("small", {}, `${a.title} · ${i + 1} / ${a.content.slides.length}`),
          el("h1", {}, slide.title),
          el(
            "ul",
            {},
            slide.bullets.map((b) => el("li", {}, b)),
          ),
          slide.speakerNotes
            ? el("aside", {}, t("Speaker notes") + ": " + slide.speakerNotes)
            : null,
          el(
            "footer",
            {},
            a.citations
              .filter((c) => slide.refs.includes(c.id))
              .map((c) =>
                el(
                  "p",
                  {},
                  `[${c.id}] ${c.title} (${c.page ? "page " + c.page : "section " + c.section}): ${c.text}`,
                ),
              ),
          ),
        ),
      ),
    );
    doc.body.append(main);
    return download(
      a.title + ".html",
      "<!doctype html>\n" + doc.documentElement.outerHTML,
      "text/html;charset=utf-8",
    );
  }
  if (a.kind === "flashcards")
    return download(
      a.title + ".csv",
      "front,back\r\n" +
        a.cards
          .map((c) => [c.front, c.back].map(csvCell).join(","))
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
  if (a.kind === "table")
    return download(
      a.title + ".csv",
      [a.content.columns, ...a.content.rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n"),
      "text/csv",
    );
  if (["guide", "note"].includes(a.kind))
    return download(
      a.title + ".md",
      "# " +
        a.title +
        "\n\n" +
        a.content.markdown +
        "\n\n" +
        a.citations
          .map(
            (c) =>
              `[${c.id}] ${c.title} (${c.page ? "page " + c.page : "section " + c.section})`,
          )
          .join("\n"),
    );
  download(a.title + ".json", JSON.stringify(a, null, 2), "application/json");
}
/** "10 min", "1 d", "2 mo": a review interval given in days. */
function intervalLabel(days) {
  const minutes = Math.round(days * 1440);
  const [value, unit] =
    minutes < 60
      ? [Math.max(1, minutes), "min"]
      : minutes < 1440
        ? [Math.round(minutes / 60), "h"]
        : days < 30
          ? [Math.round(days), "d"]
          : days < 365
            ? [Math.round(days / 30), "mo"]
            : [Math.round((days / 365) * 10) / 10, "y"];
  return `${value} ${t(unit)}`;
}
/** The AI the generate dialog would use, for the per-card AI endpoints. */
function cardAi(extra = {}) {
  try {
    const { connectionId, model, effort } = aiSelection();
    return { connectionId, model, effort, ...extra };
  } catch {
    return extra;
  }
}
const cardFresh = (c) =>
  c.lastRating == null &&
  !c.repetitions &&
  !c.lapses &&
  !c.last_review &&
  !c.lastReview;
/**
 * The flashcard study view. The card is one 3D scene whose faces are painted
 * once per card, so flipping only toggles a class. `options.resume` restores a
 * session after a citation or other dialog took over.
 */
function flashcardModal(a, options = {}) {
  const spaced = a.spaced !== false,
    isDue = (c) => c.due <= Date.now() || cardFresh(c),
    filters = {
      due: isDue,
      missed: (c) => c.lastRating === 1,
      flagged: (c) => Boolean(c.flagged),
      all: () => true,
    },
    modeNames = {
      due: "Due + new",
      missed: "Missed",
      flagged: "Flagged",
      all: "All",
    },
    counts = () => ({
      due: a.cards.filter(isDue).length,
      missed: a.cards.filter(filters.missed).length,
      flagged: a.cards.filter(filters.flagged).length,
      all: a.cards.length,
    }),
    reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    resume = options.resume;
  let mode = resume?.mode || (spaced && a.cards.some(isDue) ? "due" : "all"),
    list = resume
      ? resume.ids.map((id) => a.cards.find((c) => c.id === id)).filter(Boolean)
      : a.cards.filter(filters[mode]),
    index = resume ? Math.min(resume.index, list.length) : 0,
    flipped = Boolean(resume?.flipped) && index < list.length,
    tally = resume?.tally || [0, 0, 0, 0],
    swapping = false,
    rating = false,
    regenerating = false,
    panelOpen = false,
    editing = false,
    confirming = null,
    reveal = null,
    rate = null,
    flipAnim = null,
    target = null,
    drag = null,
    dragged = false,
    swapTimer;
  const explained = new Map(),
    threads = new Map(),
    askBoxes = new Map();
  const body = el("div", { class: "fc-study study stack" });
  const front = el("div", { class: "fc-face fc-front" }),
    back = el("div", { class: "fc-face fc-back" });
  const card = el(
    "div",
    {
      class: "fc-card",
      role: "button",
      tabindex: 0,
      "aria-pressed": "false",
      onClick: (e) => {
        if (!dragged && !e.target.closest("button, a")) flip();
      },
      onKeydown: (e) => {
        if (e.target !== card) return;
        if (e.code === "Space" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          flip();
        }
      },
    },
    front,
    back,
  );
  const working = el(
    "div",
    { class: "fc-busy", role: "status", hidden: true },
    el("span", { class: "spinner" }),
    t("Regenerating…"),
  );
  const scene = el("div", { class: "fc-scene" }, card, working);
  // Two ghost cards behind the active one, so it reads as a deck.
  const deck = el(
    "div",
    { class: "fc-stack" },
    el("div", { class: "fc-ghost fc-g2" }),
    el("div", { class: "fc-ghost fc-g1" }),
    scene,
  );
  const modeButtons = Object.keys(modeNames).map((m) =>
    el("button", {
      type: "button",
      class: "button small",
      "data-mode": m,
      onClick: () => setMode(m),
    }),
  );
  const countLine = el("p", { class: "fc-count", "aria-live": "polite" }),
    bar = el("span"),
    track = el(
      "div",
      {
        class: "progress-bar",
        role: "progressbar",
        "aria-label": t("Progress"),
      },
      bar,
    ),
    actions = el("div", { class: "fc-actions" }),
    prev = el(
      "button",
      {
        type: "button",
        class: "button fc-prev",
        "aria-label": t("Previous"),
        onClick: () => go(index - 1),
      },
      icon("arrow"),
      el("span", {}, t("Previous")),
    ),
    next = el(
      "button",
      {
        type: "button",
        class: "button fc-next",
        "aria-label": t("Next"),
        onClick: () => go(index + 1),
      },
      el("span", {}, t("Next")),
      icon("arrow"),
    ),
    centre = el("div", { class: "fc-centre" }),
    explainButton = el(
      "button",
      {
        type: "button",
        class: "button fc-explain-button",
        "aria-expanded": "false",
        "aria-controls": "fc-explain",
        onClick: () => toggleExplain(),
      },
      icon("spark"),
      el("span", {}, t("Explain")),
    ),
    panel = el("section", {
      class: "fc-explain",
      id: "fc-explain",
      hidden: true,
      "aria-label": t("Explain"),
    }),
    menu = el("div", { class: "fc-menu edit-only" }),
    stage = el(
      "div",
      { class: "fc-stage stack" },
      deck,
      el("div", { class: "fc-nav" }, prev, centre, next),
      actions,
      panel,
      menu,
    ),
    end = el("div", { class: "fc-end" });
  const shuffle = () => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    index = 0;
    flipped = false;
    render();
  };
  const setMode = (next) => {
    if (swapping || regenerating) return;
    mode = next;
    list = a.cards.filter(filters[mode]);
    index = 0;
    flipped = false;
    tally = [0, 0, 0, 0];
    render();
  };
  const more = el("details", { class: "fc-more" });
  const inMore = (node) => {
    node.addEventListener("click", () => more.removeAttribute("open"));
    return node;
  };
  more.append(
    el(
      "summary",
      { class: "icon-button", title: t("More"), "aria-label": t("More") },
      icon("more"),
    ),
    el(
      "div",
      { class: "fc-more-list" },
      inMore(
        button(
          "Export CSV",
          () => exportArtifact(a),
          "quiet small",
          "download",
        ),
      ),
      inMore(
        editOnly(button("Add card", () => addCard(a), "quiet small", "plus")),
      ),
      inMore(
        editOnly(
          button("Import CSV", () => importCards(a), "quiet small", "file"),
        ),
      ),
    ),
  );
  const keys = shortcutList([
    ["Space", "Flip"],
    ["← →", "Previous / next"],
    ["1 / 2", "Still learning / Got it"],
    ["H", "Hint"],
    ["E", "Explain"],
    ["S", "Flag"],
    ["Shift+S", "Shuffle"],
    ["R", "Restart"],
  ]);
  const toolbar = el(
    "div",
    { class: "fc-toolbar" },
    el(
      "div",
      { class: "fc-modes", role: "group", "aria-label": t("Study mode") },
      modeButtons,
    ),
    countLine,
    el(
      "div",
      { class: "fc-tools" },
      iconButton("shuffle", "Shuffle", shuffle),
      iconButton("refresh", "Restart", () => setMode(mode)),
      keys,
      more,
    ),
  );
  body.append(toolbar, track, stage, end);
  const cardLabel = () => {
    const c = list[index];
    return c
      ? `${t(flipped ? "Answer" : "Question")}: ${flipped ? c.back : c.front}. ${t("Press Space to flip")}`
      : "";
  };
  /** Mirror `flipped` onto the card; `instant` skips the rotation. */
  const syncFlip = (instant) => {
    if (instant) card.classList.add("fc-instant");
    card.classList.toggle("is-flipped", flipped);
    if (instant) {
      void card.offsetWidth;
      card.classList.remove("fc-instant");
    }
    card.setAttribute("aria-pressed", String(flipped));
    card.setAttribute("aria-label", cardLabel());
    front.inert = flipped;
    back.inert = !flipped;
    front.setAttribute("aria-hidden", String(flipped));
    back.setAttribute("aria-hidden", String(!flipped));
    if (reveal) reveal.hidden = flipped;
    if (rate) rate.hidden = !flipped;
    explainButton.hidden = !flipped;
  };
  const flip = () => {
    if (swapping || regenerating || !list[index]) return;
    flipped = !flipped;
    syncFlip();
    flipAnim?.cancel();
    if (reduced()) return;
    // Picked up, turned and put down. The turn always runs the same way, and
    // ends on the angle the class above already holds.
    const from = flipped ? 0 : 180;
    flipAnim = card.animate(
      [
        { transform: `rotateY(${from}deg)` },
        { transform: `rotateY(${from + 90}deg) translateZ(60px) scale(1.035)` },
        { transform: `rotateY(${from + 180}deg)` },
      ],
      { duration: 640, easing: "cubic-bezier(.34,1.2,.5,1)" },
    );
  };
  const renderModes = () => {
    const n = counts();
    for (const b of modeButtons) {
      const m = b.dataset.mode;
      b.replaceChildren(t(modeNames[m]), " ", el("b", {}, n[m]));
      b.setAttribute("aria-pressed", String(m === mode));
      b.disabled = n[m] === 0 && m !== mode;
    }
  };
  const paintProgress = () => {
    countLine.textContent = t("Card {n} of {total}")
      .replace("{n}", index + 1)
      .replace("{total}", list.length);
    bar.style.width = ((index + 1) / list.length) * 100 + "%";
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(list.length));
    track.setAttribute("aria-valuenow", String(index + 1));
    prev.disabled = index === 0;
  };
  // Two grades, as in the notebooklm-flashcards design. Spaced repetition
  // still runs underneath: Still learning is FSRS Again, Got it is Good.
  const rateButtons = (c) =>
    [
      [1, "Still learning", "again", 1],
      [3, "Got it", "good", 2],
    ].map(([value, name, key, shortcut]) =>
      el(
        "button",
        {
          type: "button",
          class: "button fc-rate-button" + (value === 3 ? " primary" : ""),
          "data-rating": value,
          onClick: () => void grade(value),
        },
        el("span", { class: "fc-rate-name" }, t(name)),
        spaced && c.preview
          ? el(
              "span",
              { class: "fc-rate-interval" },
              intervalLabel(c.preview[key]),
            )
          : null,
        el("kbd", {}, shortcut),
      ),
    );
  /** Paint the faces, controls and menu for the current card (not on flip). */
  const paintCard = () => {
    const c = list[index];
    const flag = c.flagged
      ? el("span", { class: "badge fc-flag" }, t("Flagged"))
      : null;
    const hint = el("p", { class: "fc-hint", hidden: true }, c.hint);
    const refs = a.citations.filter((ref) => c.refs.includes(ref.id));
    const fill = (node, ...kids) =>
      node.replaceChildren(...kids.filter(Boolean));
    // A gap card ("____" in the front) shows a blank, then the sentence
    // with the answer filled in.
    const parts = c.front.split(/_{3,}/),
      gap = parts.length === 2,
      size = (text) => "fc-text" + (text.length > 140 ? " is-long" : "");
    fill(
      front,
      el(
        "div",
        { class: "fc-top" },
        el("span", { class: "fc-label" }, c.tag || t("Question")),
        flag,
      ),
      el(
        "p",
        { class: size(c.front) },
        gap
          ? [
              parts[0],
              el("span", { class: "fc-blank", "aria-label": t("blank") }),
              parts[1],
            ]
          : c.front,
      ),
      c.hint
        ? el(
            "div",
            { class: "fc-hint-wrap" },
            button(
              "Show hint",
              (e) => {
                e.currentTarget.hidden = true;
                hint.hidden = false;
              },
              "quiet small",
            ),
            hint,
          )
        : null,
      el("span", { class: "fc-tip" }, icon("refresh"), t("Tap to flip")),
    );
    fill(
      back,
      el(
        "div",
        { class: "fc-top" },
        el("span", { class: "fc-label" }, t("Answer")),
        flag?.cloneNode(true),
      ),
      el(
        "p",
        { class: size(gap ? c.front : c.back) },
        gap
          ? [parts[0], el("mark", { class: "fc-fill" }, c.back), parts[1]]
          : c.back,
      ),
      c.explanation ? el("p", { class: "fc-note" }, c.explanation) : null,
      refs.length ? citationButtons(refs) : null,
    );
    reveal = button("Reveal answer", () => flip(), "primary");
    rate = canEdit() ? el("div", { class: "fc-rate" }, rateButtons(c)) : null;
    fill(centre, reveal, explainButton);
    fill(actions, rate);
    syncFlip(true);
    renderMenu();
  };
  const render = () => {
    clearTimeout(swapTimer);
    swapping = false;
    target = null;
    scene.className = "fc-scene";
    deck.classList.remove("is-advancing");
    renderModes();
    panelOpen = false;
    editing = false;
    confirming = null;
    panel.hidden = true;
    explainButton.setAttribute("aria-expanded", "false");
    const done = list.length > 0 && index >= list.length;
    stage.hidden = !list.length || done;
    countLine.hidden = track.hidden = stage.hidden;
    end.hidden = !stage.hidden;
    end.replaceChildren();
    if (!stage.hidden) {
      paintProgress();
      paintCard();
    } else end.append(done ? summary() : emptyView());
  };
  const emptyView = () =>
    empty(
      mode === "all" ? "This deck has no cards yet." : "Study session complete",
      mode === "all"
        ? "Add a card or import a CSV to start."
        : mode === "missed"
          ? "No missed cards."
          : "No cards are due.",
      mode === "all"
        ? null
        : button("Study all cards", () => setMode("all"), "primary"),
      "check",
    );
  const summary = () => {
    const n = counts(),
      known = tally[2],
      learning = tally[0],
      graded = known + learning;
    return el(
      "div",
      { class: "fc-summary stack" },
      scoreRing(graded ? Math.round((known / graded) * 100) : 0, t("known")),
      el("h2", {}, t("Study session complete")),
      el(
        "div",
        { class: "fc-tally" },
        el(
          "div",
          { class: "is-good" },
          el("strong", {}, known),
          el("span", {}, t("Got it")),
        ),
        el(
          "div",
          { class: "is-warn" },
          el("strong", {}, learning),
          el("span", {}, t("Still learning")),
        ),
      ),
      el(
        "div",
        { class: "row wrap fc-end-actions" },
        n.missed
          ? button(
              t("Review {n} missed").replace("{n}", n.missed),
              () => setMode("missed"),
              "primary",
            )
          : null,
        button("Restart all", () => setMode("all"), n.missed ? "" : "primary"),
        button("Shuffle and restart", () => {
          setMode("all");
          shuffle();
        }),
        editOnly(
          button(
            "Make a quiz from this deck",
            () => generateModal("quiz", { fromDeck: a.id, deckTitle: a.title }),
            "",
            "quiz",
          ),
        ),
        button("Close", () => $("#dialog").close()),
      ),
    );
  };
  /** Slide to another card, or to the summary after the last one. */
  const go = (to) => {
    if (regenerating) return;
    // A key pressed mid-slide finishes that slide at once instead of being lost.
    if (swapping) {
      if (target !== null) {
        index = target;
        flipped = false;
      }
      render();
      if (stage.hidden) return;
    }
    if (to < 0 || to > list.length || to === index) return;
    const dir = to > index ? "next" : "prev",
      instant = reduced();
    swapping = true;
    target = to;
    scene.className = "fc-scene fc-out-" + dir;
    swapTimer = setTimeout(
      () => {
        index = to;
        target = null;
        flipped = false;
        if (index >= list.length) return render();
        deck.classList.toggle("is-advancing", dir === "next");
        panelOpen = false;
        editing = false;
        confirming = null;
        panel.hidden = true;
        explainButton.setAttribute("aria-expanded", "false");
        paintProgress();
        paintCard();
        scene.className = "fc-scene fc-in-" + dir;
        swapTimer = setTimeout(
          () => {
            scene.className = "fc-scene";
            deck.classList.remove("is-advancing");
            swapping = false;
            const f = document.activeElement;
            if (!f || !body.contains(f) || f.closest("[hidden]"))
              card.focus({ preventScroll: true });
          },
          instant ? 0 : 320,
        );
      },
      instant ? 0 : 200,
    );
  };
  /** A short note under the card, such as when a card will come back. */
  const chip = (text) => {
    const node = el("p", { class: "fc-chip", role: "status" }, text);
    body.append(node);
    setTimeout(() => node.remove(), 1600);
  };
  const grade = async (value) => {
    const c = list[index];
    if (!c || !flipped || swapping || rating || regenerating || !canEdit())
      return;
    rating = true;
    rate?.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const result = await api("cards/" + c.id + "/review", {
        method: "POST",
        data: { rating: value },
      });
      Object.assign(c, result, { lastRating: value });
      tally[value - 1]++;
      // A card still being learned comes back three cards later.
      if (value === 1) {
        list.splice(Math.min(index + 4, list.length), 0, c);
        chip(t("Back in 3 cards"));
      }
      renderModes();
      go(index + 1);
    } catch (error) {
      toast(error.message, true);
    } finally {
      rating = false;
      rate?.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  };
  // --- Explain panel and Ask Folio AI -------------------------------------
  const asCitations = (cites) =>
    cites.map((cite) => ({
      ...cite,
      id: cite.ref,
      text:
        a.citations.find(
          (d) =>
            d.sourceId === cite.sourceId &&
            (d.page ?? null) === (cite.page ?? null) &&
            (d.section ?? null) === (cite.section ?? null),
        )?.text || t("Open the source to read this passage."),
    }));
  const addFollowUp = ({ front: question, back: answer }) =>
    action(async () => {
      await api("artifacts/" + a.id + "/cards", {
        method: "POST",
        data: { front: question, back: answer },
      });
      const fresh = await api("artifacts/" + a.id);
      for (const c of fresh.cards)
        if (!a.cards.some((old) => old.id === c.id)) a.cards.push(c);
      renderModes();
      toast("Card added.");
      return true;
    });
  const explainParts = (data) =>
    el(
      "div",
      { class: "fc-parts" },
      [
        ["Why this answer is correct", data.why],
        ["Detailed understanding", data.detail],
        ["Simple explanation", data.simple],
        ["Practical example", data.example],
      ].map(([label, text]) =>
        text
          ? el(
              "section",
              { class: "fc-part" },
              el("h4", {}, t(label)),
              markdown(text, asCitations(data.citations || [])),
            )
          : null,
      ),
      el(
        "section",
        { class: "fc-part" },
        el("h4", {}, t("Source reference")),
        data.citations?.length
          ? citationButtons(asCitations(data.citations))
          : el(
              "p",
              { class: "muted small" },
              t("No source passage was cited."),
            ),
      ),
      data.takeaway
        ? el(
            "section",
            { class: "fc-part fc-takeaway" },
            el("h4", {}, t("Key takeaway")),
            markdown(data.takeaway, asCitations(data.citations || [])),
          )
        : null,
      data.followUp
        ? editOnly(
            el(
              "div",
              { class: "fc-followup" },
              el("p", { class: "small" }, data.followUp.front),
              button(
                "Add as a new card",
                async (e) => {
                  const btn = e.currentTarget;
                  btn.disabled = true;
                  if (!(await addFollowUp(data.followUp))) btn.disabled = false;
                },
                "small",
                "plus",
              ),
            ),
          )
        : null,
    );
  const askBox = (c) => {
    const turns = threads.get(c.id) || [];
    threads.set(c.id, turns);
    let pending = false,
      failure = "";
    const log = el("div", {
        class: "fc-thread",
        role: "log",
        "aria-live": "polite",
      }),
      input = el("input", {
        type: "text",
        maxlength: 1000,
        placeholder: t("Ask a follow-up question"),
        "aria-label": t("Ask Folio AI"),
      }),
      send = el(
        "button",
        { type: "submit", class: "button primary small" },
        icon("send"),
        el("span", {}, t("Send")),
      );
    const draw = () => {
      log.replaceChildren(
        ...turns.map((turn) =>
          el(
            "div",
            { class: "fc-turn " + turn.role },
            turn.role === "user"
              ? el("p", {}, turn.text)
              : markdown(turn.text, turn.citations),
          ),
        ),
        ...(pending ? [busy("Working…")] : []),
        ...(failure
          ? [el("p", { class: "notice error", role: "alert" }, failure)]
          : []),
      );
      send.disabled = pending;
    };
    draw();
    return el(
      "div",
      { class: "fc-ask stack" },
      el("h4", {}, t("Ask Folio AI")),
      log,
      el(
        "form",
        {
          class: "fc-ask-form",
          onSubmit: async (e) => {
            e.preventDefault();
            const question = input.value.trim();
            if (!question || pending) return;
            const history = turns
              .slice(-6)
              .map(({ role, text }) => ({ role, text: text.slice(0, 1000) }));
            turns.push({ role: "user", text: question });
            input.value = "";
            pending = true;
            failure = "";
            draw();
            try {
              const reply = await api("cards/" + c.id + "/explain", {
                method: "POST",
                data: cardAi({ question, history }),
              });
              turns.push({
                role: "assistant",
                text: reply.answer,
                citations: asCitations(reply.citations || []),
              });
            } catch (error) {
              failure = error.message;
            } finally {
              pending = false;
              draw();
            }
          },
        },
        input,
        send,
      ),
    );
  };
  const renderPanel = () => {
    const c = list[index];
    panel.replaceChildren();
    if (!c || !panelOpen) return;
    const entry = explained.get(c.id);
    if (!askBoxes.has(c.id)) askBoxes.set(c.id, askBox(c));
    panel.append(
      el("h3", {}, t("Explain")),
      !entry || entry.status === "loading"
        ? busy("Explaining…")
        : entry.status === "error"
          ? el(
              "div",
              { class: "stack" },
              el("p", { class: "notice error", role: "alert" }, entry.message),
              button(
                "Try again",
                () => {
                  explained.delete(c.id);
                  void loadExplain(c);
                },
                "small",
              ),
            )
          : explainParts(entry.data),
      askBoxes.get(c.id),
    );
  };
  const loadExplain = async (c) => {
    if (explained.get(c.id)) return;
    explained.set(c.id, { status: "loading" });
    renderPanel();
    try {
      const data = await api("cards/" + c.id + "/explain", {
        method: "POST",
        data: cardAi(),
      });
      explained.set(c.id, { status: "done", data });
    } catch (error) {
      explained.set(c.id, { status: "error", message: error.message });
    }
    if (list[index] === c) renderPanel();
  };
  const toggleExplain = () => {
    if (!flipped || swapping || !list[index]) return;
    panelOpen = !panelOpen;
    panel.hidden = !panelOpen;
    explainButton.setAttribute("aria-expanded", String(panelOpen));
    if (panelOpen) void loadExplain(list[index]);
    renderPanel();
  };
  // --- Per-card menu: edit, regenerate, flag, delete ----------------------
  const regenerate = async (c, instructions) => {
    confirming = null;
    regenerating = true;
    working.hidden = false;
    card.classList.add("is-busy");
    renderMenu();
    try {
      Object.assign(
        c,
        await api("cards/" + c.id + "/regenerate", {
          method: "POST",
          data: cardAi(instructions ? { instructions } : {}),
        }),
      );
      explained.delete(c.id);
      askBoxes.delete(c.id);
      toast("Card regenerated.");
    } catch (error) {
      toast(error.message, true);
    } finally {
      regenerating = false;
      working.hidden = true;
      card.classList.remove("is-busy");
    }
    if (list[index] === c) {
      paintCard();
      renderPanel();
    }
  };
  const editForm = (c) => {
    const frontField = el("textarea", {
        required: true,
        maxlength: 12000,
        value: c.front,
      }),
      backField = el("textarea", {
        required: true,
        maxlength: 12000,
        value: c.back,
      }),
      hintField = el("input", { maxlength: 1000, value: c.hint || "" }),
      noteField = el("textarea", {
        maxlength: 2000,
        value: c.explanation || "",
      });
    return el(
      "form",
      {
        class: "fc-edit stack",
        onSubmit: (e) => {
          e.preventDefault();
          void action(async () => {
            const changes = {
              front: frontField.value,
              back: backField.value,
              hint: hintField.value,
              explanation: noteField.value,
            };
            await api("cards/" + c.id, { method: "PATCH", data: changes });
            if (changes.front !== c.front || changes.back !== c.back) {
              explained.delete(c.id);
              c.hasDetail = false;
            }
            Object.assign(c, changes);
            editing = false;
            paintCard();
            renderPanel();
            toast("Card updated.");
          });
        },
      },
      field("Front", frontField),
      field("Back", backField),
      field("Hint (optional)", hintField),
      field("Explanation (optional)", noteField),
      el(
        "div",
        { class: "row wrap" },
        el(
          "button",
          { type: "submit", class: "button primary small" },
          t("Save"),
        ),
        button("Cancel", () => choose(null), "small"),
      ),
    );
  };
  const choose = (next) => {
    confirming = next;
    editing = next === "edit";
    renderMenu();
  };
  const toggleFlag = (c) =>
    action(async () => {
      await api("cards/" + c.id, {
        method: "PATCH",
        data: { flagged: !c.flagged },
      });
      c.flagged = !c.flagged;
      toast(c.flagged ? "Card flagged." : "Flag removed.");
      renderModes();
      paintCard();
    });
  const renderMenu = () => {
    const c = list[index];
    menu.replaceChildren();
    if (!c) return;
    if (editing) return menu.append(editForm(c));
    if (confirming === "delete")
      return menu.append(
        el("p", { class: "small" }, t("Delete this card?")),
        button("Cancel", () => choose(null), "small"),
        button(
          "Delete",
          () =>
            action(async () => {
              await api("cards/" + c.id, { method: "DELETE" });
              a.cards = a.cards.filter((x) => x !== c);
              list.splice(index, 1);
              index = Math.max(0, Math.min(index, list.length - 1));
              flipped = false;
              render();
            }),
          "small danger",
          "trash",
        ),
      );
    if (confirming === "regenerate") {
      const instructions = el("input", {
        maxlength: 1000,
        "aria-label": t("Instructions (optional)"),
        placeholder: t("Instructions (optional)"),
      });
      return menu.append(
        el(
          "p",
          { class: "small" },
          t(
            "Folio AI rewrites this card from your sources. Your review history is kept.",
          ),
        ),
        instructions,
        button("Cancel", () => choose(null), "small"),
        button(
          "Regenerate",
          () => void regenerate(c, instructions.value.trim()),
          "small primary",
          "wand",
        ),
      );
    }
    menu.append(
      button("Edit", () => choose("edit"), "quiet small", "edit"),
      button("Regenerate", () => choose("regenerate"), "quiet small", "wand"),
      button(
        c.flagged ? "Unflag" : "Flag",
        () => toggleFlag(c),
        "quiet small",
        "pin",
      ),
      button("Delete", () => choose("delete"), "quiet small danger", "trash"),
    );
  };
  render();
  const dialog = modal(a.title, body);
  const snapshot = () => ({
    mode,
    ids: list.map((c) => c.id),
    index,
    flipped,
    tally: [...tally],
  });
  resumeAfterCitation(dialog, body, () => {
    const at = snapshot();
    return () => flashcardModal(a, { resume: at });
  });
  // Drag or swipe the card sideways to move; a tap still flips it.
  card.addEventListener("pointerdown", (e) => {
    if (e.button || swapping || e.target.closest("button, a")) return;
    drag = { x: e.clientX, at: e.timeStamp, dx: 0 };
  });
  card.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    if (Math.abs(drag.dx) < 6 || reduced()) return;
    if (!dragged) card.setPointerCapture(e.pointerId);
    dragged = true;
    scene.style.transform = `translateX(${drag.dx * 0.9}px) rotate(${Math.max(-12, Math.min(12, drag.dx / 24))}deg)`;
  });
  const drop = (e) => {
    if (!drag) return;
    const { dx, at } = drag,
      flick = Math.abs(dx) / Math.max(1, e.timeStamp - at) > 0.6,
      from = scene.style.transform,
      to = index + (dx < 0 ? 1 : -1);
    drag = null;
    if (!dragged) return;
    scene.style.transform = "";
    if ((Math.abs(dx) > 90 || flick) && to >= 0) go(to);
    else
      scene.animate([{ transform: from }, { transform: "none" }], {
        duration: 360,
        easing: "cubic-bezier(.34,1.4,.5,1)",
      });
    // The click that ends a drag must not flip the card.
    setTimeout(() => (dragged = false));
  };
  card.addEventListener("pointerup", drop);
  card.addEventListener("pointercancel", drop);
  const keydown = (e) => {
    if (!body.isConnected || !dialog.open) return off();
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.("input,textarea,select,[contenteditable=true]"))
      return;
    const key = e.key.toLowerCase();
    if (e.key === "?") keys.open = !keys.open;
    else if (!list.length || index >= list.length) return;
    else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === " " && !e.target.closest?.("button,a,summary")) flip();
    else if (flipped && (e.key === "1" || e.key === "2"))
      void grade(e.key === "1" ? 1 : 3);
    else if (flipped && key === "e") toggleExplain();
    else if (!flipped && key === "h")
      front.querySelector(".fc-hint-wrap .button:not([hidden])")?.click();
    else if (e.key === "S") shuffle();
    else if (key === "s" && canEdit()) void toggleFlag(list[index]);
    else if (key === "r") setMode(mode);
    else return;
    e.preventDefault();
  };
  const off = () => {
    document.removeEventListener("keydown", keydown);
    dialog.removeEventListener("close", closed);
    flipAnim?.cancel();
    clearTimeout(swapTimer);
  };
  const closed = () => {
    if (!body.isConnected || !dialog.open) off();
  };
  document.addEventListener("keydown", keydown);
  dialog.addEventListener("close", closed);
}
function addCard(a) {
  const front = el("textarea", { required: true, maxlength: 12000 }),
    back = el("textarea", { required: true, maxlength: 12000 });
  modal(
    "Add card",
    el(
      "form",
      {
        class: "stack",
        onSubmit: (e) => {
          e.preventDefault();
          void action(async () => {
            await api("artifacts/" + a.id + "/cards", {
              method: "POST",
              data: { front: front.value, back: back.value },
            });
            await openArtifact(a.id);
          });
        },
      },
      field("Front", front),
      field("Back", back),
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { type: "submit", class: "button primary" }, t("Save")),
      ),
    ),
  );
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((c) => c.length)) rows.push(row);
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  return rows;
}
function importCards(a) {
  const file = el("input", { type: "file", accept: ".csv" });
  modal(
    "Import CSV",
    el(
      "div",
      { class: "stack" },
      el("p", {}, "CSV with front,back columns. Maximum 100 cards per import."),
      file,
      button(
        "Import CSV",
        () =>
          action(async () => {
            const f = file.files[0];
            if (!f || f.size > 1_000_000)
              throw new Error("Choose a CSV smaller than 1 MB.");
            const rows = parseCSV(await f.text());
            if (rows[0]?.[0].toLowerCase() === "front") rows.shift();
            if (
              !rows.length ||
              rows.length > 100 ||
              rows.some((r) => r.length !== 2 || !r[0] || !r[1])
            )
              throw new Error(
                "Expected 1–100 rows with two non-empty columns.",
              );
            await api("artifacts/" + a.id + "/cards/import", {
              method: "POST",
              data: { cards: rows.map((r) => ({ front: r[0], back: r[1] })) },
            });
            await openArtifact(a.id);
          }),
        "primary",
      ),
    ),
  );
}
function manualDeck() {
  const title = el("input", { required: true, maxlength: 200 });
  modal(
    "Manual deck",
    el(
      "form",
      {
        class: "stack",
        onSubmit: (e) => {
          e.preventDefault();
          void action(async () => {
            const result = await api(
              "notebooks/" + state.activeNotebook + "/decks",
              { method: "POST", data: { title: title.value } },
            );
            await openNotebook(state.activeNotebook);
            await openArtifact(result.id);
          });
        },
      },
      field("Title", title),
      el(
        "button",
        { class: "button primary", type: "submit" },
        t("Create deck"),
      ),
    ),
  );
}
// --- Shared by the study screens (flashcards and quiz) ---------------------
/** A small popover listing keyboard shortcuts, opened from a keyboard icon. */
function shortcutList(rows) {
  return el(
    "details",
    { class: "fc-more study-keys" },
    el(
      "summary",
      {
        class: "icon-button",
        title: t("Shortcuts"),
        "aria-label": t("Shortcuts"),
      },
      icon("keyboard"),
    ),
    el(
      "dl",
      { class: "fc-more-list" },
      rows.map(([key, what]) => [
        el("dt", {}, el("kbd", {}, key)),
        el("dd", {}, t(what)),
      ]),
    ),
  );
}
/** A ring that fills to `percent` while its number counts up. */
function scoreRing(percent, caption = "") {
  const NS = "http://www.w3.org/2000/svg",
    length = 2 * Math.PI * 52;
  const circle = (name) => {
    const node = document.createElementNS(NS, "circle");
    for (const [key, value] of Object.entries({
      class: name,
      cx: 60,
      cy: 60,
      r: 52,
    }))
      node.setAttribute(key, String(value));
    return node;
  };
  const svg = document.createElementNS(NS, "svg"),
    fill = circle("score-ring-fill"),
    number = el("strong", {}, "0%");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("aria-hidden", "true");
  fill.setAttribute("stroke-dasharray", String(length));
  svg.append(circle("score-ring-track"), fill);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches,
    began = performance.now();
  const step = (now) => {
    const p = still ? 1 : Math.min(1, Math.max(0, now - began) / 900),
      eased = 1 - (1 - p) ** 3;
    fill.setAttribute(
      "stroke-dashoffset",
      String(length * (1 - (percent / 100) * eased)),
    );
    number.textContent = Math.round(percent * eased) + "%";
    if (p < 1) requestAnimationFrame(step);
  };
  step(began);
  if (!still) requestAnimationFrame(step);
  return el(
    "div",
    { class: "score-ring", role: "img", "aria-label": `${percent}% ${caption}` },
    svg,
    el(
      "div",
      { class: "score-ring-text" },
      number,
      caption ? el("span", {}, caption) : null,
    ),
  );
}
/**
 * A citation replaces the open study dialog; closing that citation brings the
 * session back. `capture` is called at the click and returns the function
 * that reopens the session as it was. The citation button's own handler has
 * already run when the click reaches here, so the citation dialog is
 * identified now rather than from the order of close events: the study
 * dialog's own close event arrives a frame later, possibly after the citation
 * was closed too.
 */
function resumeAfterCitation(dialog, body, capture) {
  body.addEventListener("click", (e) => {
    if (!e.target.closest(".citation, .citation-source")) return;
    if (body.isConnected || !dialog.open) return;
    const reopen = capture(),
      citation = dialog.querySelector(".dialog-body");
    const restore = () => {
      if (dialog.open) {
        // Still showing the citation: this is the study dialog's late close
        // event. Showing anything else: the citation was replaced, so stand down.
        if (dialog.querySelector(".dialog-body") !== citation)
          dialog.removeEventListener("close", restore);
        return;
      }
      dialog.removeEventListener("close", restore);
      if (citation.isConnected) reopen();
    };
    dialog.addEventListener("close", restore);
  });
}
/** A shuffled list of 0..length-1 that is the same for the same seed. */
function seededOrder(length, seed) {
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
// --- Quiz: practice and exam modes, in the notebooklm-quiz design ----------
// The answer key never reaches the page. Practice mode checks one answer at a
// time (`/check`); a finished whole quiz is saved as an attempt (`/attempt`).
function quizModal(a, resume) {
  const questions = a.content.questions,
    letters = "ABCDEF",
    everything = () => questions.map((_, i) => i);
  const S = resume || {
    view: "start", // start | quiz | results | review
    mode: "practice",
    shuffle: true,
    attempt: 0,
    order: everything(),
    i: 0,
    picked: {}, // question -> chosen option
    verdicts: {}, // question -> what /check said
    hints: new Set(), // questions whose hint was used
    hintOpen: null,
    flagged: new Set(),
    seconds: 0,
    result: null, // the saved attempt of a whole-quiz run
    filter: "all",
    confirming: null, // "submit" | "restart"
  };
  let busy = false,
    dir = 1;
  const body = el("div", { class: "qz study" }),
    live = el("p", { class: "sr-only", "aria-live": "polite" }),
    clock = el("span", { class: "qz-clock" }),
    segments = el("div", { class: "qz-segments" }),
    stage = el("div", { class: "qz-stage" });
  const keys = shortcutList([
    ["A–D / 1–4", "Choose an answer"],
    ["Enter", "Next"],
    ["← →", "Previous / next"],
    ["H", "Hint"],
    ["F", "Flag (exam)"],
    ["E", "Why not the others?"],
    ["R", "Restart"],
  ]);
  const time = () =>
    `${Math.floor(S.seconds / 60)}:${String(S.seconds % 60).padStart(2, "0")}`;
  const whole = () => S.order.length === questions.length;
  const optionOrder = (q) =>
    S.shuffle
      ? seededOrder(questions[q].options.length, (q + 1) * 7919 + S.attempt)
      : questions[q].options.map((_, i) => i);
  /** One row per question of this run, from the saved attempt or the checks. */
  const rows = () =>
    S.order.map((q) => {
      const r = S.result ? S.result.results[q] : S.verdicts[q],
        selected = S.picked[q] ?? null;
      return {
        q,
        selected,
        answer: r.answer,
        answers: r.answers || [],
        accept: r.accept || [],
        correct: selected !== null && Boolean(r.correct),
        explanation: r.explanation,
        explainWrong: r.explainWrong || {},
        refs: r.refs || [],
        topic: questions[q].topic,
      };
    });
  const reviewRows = () =>
    rows().filter(
      (r) =>
        S.filter === "all" ||
        (S.filter === "incorrect" ? !r.correct : S.flagged.has(r.q)),
    );
  const viewerNote = () =>
    canEdit()
      ? null
      : el(
          "p",
          { class: "muted small" },
          t(
            "Your score is shown to you only; it isn't saved to the owner's notebook.",
          ),
        );
  const begin = (order) => {
    Object.assign(S, {
      view: "quiz",
      order,
      i: 0,
      picked: {},
      verdicts: {},
      hints: new Set(),
      hintOpen: null,
      flagged: new Set(),
      seconds: 0,
      result: null,
      filter: "all",
      confirming: null,
    });
    dir = 1;
    show();
  };
  const finish = async () => {
    if (busy) return;
    busy = true;
    try {
      if (whole())
        S.result = await api("artifacts/" + a.id + "/attempt", {
          method: "POST",
          data: { answers: questions.map((_, q) => S.picked[q] ?? null) },
        });
      // A run of only the missed questions is graded, not saved as an attempt.
      else
        await Promise.all(
          S.order
            .filter((q) => !S.verdicts[q])
            .map(async (q) => {
              S.verdicts[q] = await api("artifacts/" + a.id + "/check", {
                method: "POST",
                data: { index: q, answer: S.picked[q] ?? 0 },
              });
            }),
        );
      S.view = "results";
      S.confirming = null;
      show();
      if (whole()) void refreshData();
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy = false;
    }
  };
  const submit = () => {
    const open = S.order.filter((q) => S.picked[q] == null).length;
    if (open && S.confirming !== "submit") {
      S.confirming = "submit";
      return paint();
    }
    void finish();
  };
  const typed = (q) => ["blank", "short"].includes(questions[q].type);
  /** Practice: send one answer (an option, several options or text) for checking. */
  const grade = async (answer) => {
    const q = S.order[S.i];
    if (S.view !== "quiz" || busy || S.verdicts[q] || answer == null) return;
    busy = true;
    try {
      const verdict = await api("artifacts/" + a.id + "/check", {
        method: "POST",
        data: { index: q, answer },
      });
      S.picked[q] = answer;
      S.verdicts[q] = verdict;
      const order = optionOrder(q);
      live.textContent = verdict.correct
        ? t("Correct")
        : `${t("Incorrect")}. ${t("The correct answer is")} ${
            typed(q)
              ? verdict.accept[0]
              : (questions[q].type === "multi"
                  ? verdict.answers
                  : [verdict.answer]
                )
                  .map((o) => letters[order.indexOf(o)])
                  .sort()
                  .join(", ")
          }`;
      paint(true);
      stage.querySelector(".qz-next")?.focus({ preventScroll: true });
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy = false;
    }
  };
  const pick = (option) => {
    const q = S.order[S.i];
    if (S.view !== "quiz" || busy) return;
    if (S.mode === "practice" && S.verdicts[q]) return;
    S.confirming = null;
    // Multiple select: options toggle; practice then needs "Check answer".
    if (questions[q].type === "multi") {
      const chosen = new Set(S.picked[q] || []);
      chosen.has(option) ? chosen.delete(option) : chosen.add(option);
      if (chosen.size) S.picked[q] = [...chosen];
      else delete S.picked[q];
      return paint();
    }
    if (S.mode === "exam") {
      S.picked[q] = option;
      return paint();
    }
    void grade(option);
  };
  const step = (by) => {
    const review = S.view === "review";
    if (S.view !== "quiz" && !review) return;
    const count = review ? reviewRows().length : S.order.length,
      to = S.i + by;
    if (to < 0) return;
    if (to >= count) {
      if (review) {
        S.view = "results";
        return show();
      }
      if (S.mode === "exam") return submit();
      return S.verdicts[S.order[S.i]] ? void finish() : undefined;
    }
    // Practice moves on only once the question is answered.
    if (!review && S.mode === "practice" && by > 0 && !S.verdicts[S.order[S.i]])
      return;
    jump(to);
  };
  const jump = (to) => {
    dir = to >= S.i ? 1 : -1;
    S.i = to;
    S.confirming = null;
    S.hintOpen = null;
    show();
  };
  const toggleHint = () => {
    const q = S.order[S.i];
    if (S.view !== "quiz" || S.mode !== "practice" || !questions[q].hint) return;
    if (S.verdicts[q]) return;
    S.hintOpen = S.hintOpen === q ? null : q;
    S.hints.add(q);
    paint();
  };
  const toggleFlag = () => {
    const q = S.order[S.i];
    if (S.view !== "quiz" || S.mode !== "exam") return;
    S.flagged.has(q) ? S.flagged.delete(q) : S.flagged.add(q);
    paint();
  };
  const restart = () => {
    if (S.view === "start") return;
    if (
      S.view === "quiz" &&
      Object.keys(S.picked).length &&
      S.confirming !== "restart"
    ) {
      S.confirming = "restart";
      return paint();
    }
    S.view = "start";
    S.confirming = null;
    show();
  };
  const paintSegments = () => {
    const review = S.view === "review",
      list = review ? reviewRows().map((r) => r.q) : S.order,
      graded = review ? Object.fromEntries(rows().map((r) => [r.q, r])) : {},
      answered = S.order.findIndex((q) => !S.verdicts[q]);
    segments.hidden = S.view === "start" || S.view === "results";
    segments.replaceChildren(
      ...list.map((q, n) => {
        const verdict = review
            ? graded[q]
            : S.mode === "practice"
              ? S.verdicts[q]
              : null,
          state = verdict
            ? verdict.correct
              ? "is-good"
              : "is-bad"
            : S.picked[q] != null
              ? "is-done"
              : "",
          // Practice reaches only answered questions and the next one.
          open =
            review ||
            S.mode === "exam" ||
            answered === -1 ||
            n <= answered;
        return el("button", {
          type: "button",
          class: `qz-seg ${state}${n === S.i ? " is-current" : ""}${S.flagged.has(q) ? " is-flagged" : ""}`,
          "aria-label": `${t("Question")} ${n + 1}${S.flagged.has(q) ? ", " + t("flagged") : ""}`,
          "aria-current": n === S.i ? "step" : null,
          disabled: !open,
          onClick: () => jump(n),
        });
      }),
    );
  };
  const startView = () => {
    const n = questions.length,
      seg = (mode, label) =>
        el(
          "button",
          {
            type: "button",
            role: "radio",
            class: "qz-mode",
            "aria-checked": String(S.mode === mode),
            onClick: () => {
              S.mode = mode;
              show();
            },
          },
          t(label),
        );
    return el(
      "section",
      { class: "qz-card qz-start" },
      el(
        "p",
        { class: "qz-label" },
        `${n} ${t(n === 1 ? "question" : "questions")} · ~${Math.max(1, Math.round(n * 0.75))} min`,
      ),
      el(
        "div",
        { class: "qz-modes", role: "radiogroup", "aria-label": t("Mode") },
        seg("practice", "Practice"),
        seg("exam", "Exam"),
      ),
      el(
        "p",
        { class: "muted" },
        t(
          S.mode === "practice"
            ? "Feedback and an explanation after each answer."
            : "No feedback or hints until you submit. Flag questions and jump between them.",
        ),
      ),
      el(
        "label",
        { class: "qz-switch" },
        el("input", {
          type: "checkbox",
          checked: S.shuffle,
          onChange: (e) => (S.shuffle = e.target.checked),
        }),
        t("Shuffle options"),
      ),
      viewerNote(),
      button("Start", () => begin(everything()), "primary qz-next"),
    );
  };
  const questionView = (fresh = false) => {
    const review = S.view === "review",
      list = review ? reviewRows() : S.order.map((q) => ({ q })),
      filters = review
        ? el(
            "div",
            { class: "qz-filters", role: "group", "aria-label": t("Filter") },
            [
              ["all", "All"],
              ["incorrect", "Incorrect"],
              ["flagged", "Flagged"],
            ].map(([value, label]) =>
              el(
                "button",
                {
                  type: "button",
                  class: "qz-chip",
                  "aria-pressed": String(S.filter === value),
                  onClick: () => {
                    S.filter = value;
                    S.i = 0;
                    show();
                  },
                },
                t(label),
              ),
            ),
          )
        : null;
    if (!list.length)
      return el(
        "article",
        { class: "qz-card" },
        filters,
        el("p", { class: "muted" }, t("No questions match this filter.")),
        el(
          "footer",
          { class: "qz-actions" },
          button(
            "Finish review",
            () => {
              S.view = "results";
              show();
            },
            "primary qz-next",
          ),
        ),
      );
    const q = list[S.i].q,
      item = questions[q],
      order = optionOrder(q),
      letter = (option) => letters[order.indexOf(option)],
      verdict = review
        ? list[S.i]
        : S.mode === "practice"
          ? S.verdicts[q]
          : null,
      chosen = S.picked[q] ?? null,
      multi = item.type === "multi",
      text = typed(q),
      ok = verdict && chosen !== null && verdict.correct,
      // Practice checks a multiple-select or typed answer on request.
      needsCheck =
        !review && S.mode === "practice" && !verdict && (multi || text),
      isChosen = (option) =>
        multi ? (chosen || []).includes(option) : option === chosen,
      last = S.i === list.length - 1;
    const options = order.map((option, slot) => {
      const right =
          verdict &&
          (multi ? verdict.answers.includes(option) : option === verdict.answer),
        wrong = verdict && isChosen(option) && !right,
        node = el(
          "button",
          {
            type: "button",
            role: multi ? "checkbox" : "radio",
            class:
              "qz-option" +
              (right
                ? " is-right"
                : wrong
                  ? " is-wrong"
                  : verdict
                    ? " is-dim"
                    : isChosen(option)
                      ? " is-picked"
                      : ""),
            "aria-checked": String(isChosen(option)),
            "aria-disabled": verdict ? "true" : null,
            onClick: () => void pick(option),
          },
          el(
            "span",
            { class: "qz-badge" },
            right
              ? icon("check")
              : wrong
                ? icon("close")
                : !verdict && isChosen(option)
                  ? icon("check")
                  : letters[slot],
          ),
          el("span", { class: "qz-option-text" }, item.options[option]),
          right || wrong
            ? el(
                "span",
                { class: "qz-option-state" },
                t(
                  right
                    ? multi && isChosen(option)
                      ? "Correct, chosen"
                      : "Correct answer"
                    : "Your answer",
                ),
              )
            : null,
        );
      node.style.setProperty("--i", String(slot));
      return node;
    });
    const why = (option) =>
      el(
        "p",
        { class: "qz-why" },
        el("strong", {}, letter(option) + ". "),
        verdict.explainWrong[option],
      );
    const answerBox = text
      ? el("input", {
          class: "qz-input" + (verdict ? (ok ? " is-right" : " is-wrong") : ""),
          type: "text",
          maxlength: 300,
          autocomplete: "off",
          spellcheck: "false",
          value: typeof chosen === "string" ? chosen : "",
          placeholder: t("Type your answer"),
          "aria-label": t("Your answer"),
          disabled: Boolean(verdict),
          onInput: (e) => {
            const value = e.target.value.trim();
            if (value) S.picked[q] = value;
            else delete S.picked[q];
            if (needsCheck) forward.disabled = !value;
            paintSegments();
          },
          onKeydown: (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            needsCheck ? void grade(S.picked[q]) : step(1);
          },
        })
      : null;
    const others = verdict && !multi && !text
      ? order.filter(
          (o) => o !== verdict.answer && o !== chosen && verdict.explainWrong?.[o],
        )
      : [];
    const cited = verdict
      ? a.citations.filter((c) => (verdict.refs || []).includes(c.id))
      : [];
    const feedback = verdict
      ? el(
          "section",
          { class: "qz-feedback " + (ok ? "is-good" : "is-bad") },
          el(
            "p",
            { class: "qz-verdict" },
            icon(ok ? "check" : "close"),
            t(ok ? "Correct" : chosen === null ? "Not answered" : "Not quite"),
          ),
          text && !ok
            ? el(
                "p",
                { class: "qz-accept" },
                el("strong", {}, t("Accepted answer") + ": "),
                verdict.accept.join(" · "),
              )
            : null,
          markdown(verdict.explanation, a.citations),
          !ok && typeof chosen === "number" && verdict.explainWrong?.[chosen]
            ? why(chosen)
            : null,
          others.length
            ? el(
                "details",
                { class: "qz-others", open: review ? "" : null },
                el("summary", {}, t("Why not the others?")),
                others.map(why),
              )
            : null,
          cited.length ? citationButtons(cited) : null,
        )
      : null;
    const hinted = !review && S.hintOpen === q;
    const previous = button("Previous", () => step(-1), "quiet");
    previous.disabled = S.i === 0;
    const forward = needsCheck
      ? button("Check answer", () => void grade(S.picked[q]), "primary qz-next")
      : button(
      review
        ? last
          ? "Finish review"
          : "Next"
        : S.mode === "exam"
          ? last
            ? "Submit"
            : "Next"
          : last
            ? "See results"
            : "Next",
      () => step(1),
      "primary qz-next",
    );
    forward.disabled = needsCheck
      ? S.picked[q] == null
      : !review && S.mode === "practice" && !verdict;
    const hintButton =
      !review && S.mode === "practice" && item.hint
        ? button(hinted ? "Hide hint" : "Hint", toggleHint, "quiet", "help")
        : null;
    if (hintButton) hintButton.disabled = Boolean(verdict);
    const flagButton =
      !review && S.mode === "exam"
        ? el(
            "button",
            {
              type: "button",
              class: "button quiet qz-flag",
              "aria-pressed": String(S.flagged.has(q)),
              onClick: toggleFlag,
            },
            icon("flag"),
            el("span", {}, t(S.flagged.has(q) ? "Flagged" : "Flag")),
          )
        : null;
    const open = S.order.filter((x) => S.picked[x] == null).length;
    const footer =
      !review && S.confirming
        ? el(
            "footer",
            { class: "qz-actions qz-confirm", role: "alert" },
            el(
              "p",
              {},
              S.confirming === "submit"
                ? `${open} ${t(open === 1 ? "question is unanswered." : "questions are unanswered.")} ${t("Submit anyway?")}`
                : t("Restart this quiz? Your answers will be cleared."),
            ),
            button("Keep going", () => {
              S.confirming = null;
              paint();
            }),
            S.confirming === "submit"
              ? button("Submit", () => void finish(), "primary qz-next")
              : button("Restart", restart, "primary qz-next"),
          )
        : el(
            "footer",
            { class: "qz-actions" },
            previous,
            hintButton,
            flagButton,
            !review && S.mode === "exam" && !last
              ? button("Submit", submit, "quiet")
              : null,
            forward,
          );
    return el(
      "article",
      {
        class: "qz-card" + (fresh ? " is-fresh" : "") + (review ? " is-review" : ""),
        tabindex: -1,
      },
      filters,
      el(
        "p",
        { class: "qz-label" },
        `${t("Question")} ${S.i + 1} ${t("of")} ${list.length}`,
        item.topic ? " · " + item.topic : "",
      ),
      el("h3", { class: "qz-stem" }, item.question),
      hinted ? el("p", { class: "qz-hint" }, item.hint) : null,
      multi
        ? el("p", { class: "qz-pick-note" }, t("Select all that apply."))
        : null,
      text
        ? answerBox
        : el(
            "div",
            {
              class: "qz-options",
              role: multi ? "group" : "radiogroup",
              "aria-label": t("Answers"),
            },
            options,
          ),
      review && chosen === null
        ? el("p", { class: "muted small" }, t("Not answered"))
        : null,
      feedback,
      footer,
    );
  };
  const resultsView = () => {
    const all = rows(),
      correct = all.filter((r) => r.correct).length,
      skipped = all.filter((r) => r.selected === null).length,
      missed = all.filter((r) => !r.correct),
      percent = Math.round((correct / all.length) * 100);
    const topics = new Map();
    for (const r of all) {
      const entry = topics.get(r.topic) || { name: r.topic, right: 0, total: 0 };
      entry.total++;
      if (r.correct) entry.right++;
      topics.set(r.topic, entry);
    }
    // Weakest topics first: that is what to study next.
    const ranked = [...topics.values()].sort(
        (x, y) => x.right / x.total - y.right / y.total,
      ),
      weak = ranked.filter((x) => x.right < x.total).length;
    const makeCards = () =>
      action(async () => {
        const deck = await api("artifacts/" + a.id + "/flashcards", {
          method: "POST",
          data: S.result.id
            ? { attemptId: S.result.id }
            : { answers: questions.map((_, q) => S.picked[q] ?? null) },
        });
        await openNotebook(state.activeNotebook);
        await refreshData();
        toast("Flashcards created from your missed answers.");
        await openArtifact(deck.id);
      });
    return el(
      "section",
      { class: "qz-results" },
      el(
        "div",
        { class: "qz-score" },
        scoreRing(percent, `${correct} / ${all.length}`),
        el(
          "div",
          { class: "stack" },
          el(
            "h3",
            {},
            t(
              percent >= 90
                ? "Strong."
                : percent >= 70
                  ? "Solid."
                  : percent >= 50
                    ? "Getting there."
                    : "Needs another pass.",
            ),
            " ",
            weak
              ? weak === 1
                ? t("1 topic to revisit.")
                : `${weak} ${t("topics to revisit.")}`
              : t("Nothing to revisit."),
          ),
          viewerNote(),
        ),
      ),
      el(
        "dl",
        { class: "qz-stats" },
        [
          ["Correct", correct],
          ["Incorrect", all.length - correct - skipped],
          ["Skipped", skipped],
          ["Hints used", S.hints.size],
          ["Time", time()],
        ].map(([label, value]) =>
          el("div", {}, el("dt", {}, t(label)), el("dd", {}, value)),
        ),
      ),
      el(
        "section",
        { class: "qz-topics" },
        el("h4", {}, t("By topic")),
        ranked.map((topic, n) => {
          const bar = el("i");
          bar.style.setProperty("--w", String(topic.right / topic.total));
          bar.style.setProperty("--i", String(n));
          return el(
            "div",
            { class: "qz-topic" },
            el("span", {}, topic.name),
            el("span", { class: "qz-topic-bar" }, bar),
            el("span", { class: "qz-topic-count" }, `${topic.right}/${topic.total}`),
          );
        }),
      ),
      el(
        "div",
        { class: "row wrap qz-end" },
        button(
          "Review answers",
          () => {
            Object.assign(S, { view: "review", i: 0, filter: "all" });
            dir = 1;
            show();
          },
          "primary qz-next",
        ),
        missed.length
          ? button(`${t("Retry missed")} (${missed.length})`, () => {
              S.attempt++;
              begin(missed.map((r) => r.q));
            })
          : null,
        button("Retake all", () => begin(everything())),
        button("Shuffle and retake", () => {
          S.attempt++;
          begin(seededOrder(questions.length, S.attempt));
        }),
        missed.length && whole()
          ? editOnly(
              button(
                "Make flashcards from missed answers",
                makeCards,
                "",
                "cards",
              ),
            )
          : null,
      ),
    );
  };
  /** Redraw the current question in place (an answer, a hint, a flag). */
  const paint = (fresh = false) => {
    paintSegments();
    stage.replaceChildren(questionView(fresh));
  };
  /** Draw the current view; a question slides in from the side it came from. */
  const show = () => {
    clock.hidden = S.view !== "quiz" || S.mode !== "exam";
    clock.textContent = time();
    paintSegments();
    const question = S.view === "quiz" || S.view === "review",
      view =
        S.view === "start"
          ? startView()
          : S.view === "results"
            ? resultsView()
            : questionView();
    if (question) view.classList.add(dir > 0 ? "qz-in-next" : "qz-in-prev");
    stage.replaceChildren(view);
    if (body.isConnected)
      (question ? view : view.querySelector(".qz-next"))?.focus({
        preventScroll: true,
      });
  };
  body.append(
    el(
      "div",
      { class: "qz-bar" },
      clock,
      el(
        "div",
        { class: "qz-tools" },
        keys,
        iconButton("refresh", "Restart", restart),
      ),
    ),
    segments,
    stage,
    live,
  );
  show();
  const dialog = modal(a.title, body);
  resumeAfterCitation(dialog, body, () => () => quizModal(a, S));
  // Counts while a quiz is open; stops when this screen is replaced or closed.
  const timer = setInterval(() => {
    if (!body.isConnected || !dialog.open) return clearInterval(timer);
    if (S.view !== "quiz") return;
    S.seconds++;
    clock.textContent = time();
  }, 1000);
  const keydown = (e) => {
    if (!body.isConnected || !dialog.open) return off();
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.("input,textarea,select,[contenteditable=true]"))
      return;
    const key = e.key.toLowerCase(),
      q = S.order[S.i];
    if (e.key === "?") keys.open = !keys.open;
    else if (S.view !== "quiz" && S.view !== "review") return;
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Enter" && !e.target.closest?.("button,a,summary"))
      step(1);
    else if (key === "e") {
      const more = stage.querySelector(".qz-others");
      if (more) more.open = !more.open;
    } else if (key === "r") restart();
    else if (S.view !== "quiz") return;
    else if (/^[a-d1-6]$/.test(key)) {
      const slot = /\d/.test(key) ? Number(key) - 1 : letters.indexOf(key.toUpperCase()),
        option = optionOrder(q)[slot];
      if (option === undefined) return;
      void pick(option);
    } else if (key === "h") toggleHint();
    else if (key === "f") toggleFlag();
    else return;
    e.preventDefault();
  };
  const off = () => {
    document.removeEventListener("keydown", keydown);
    dialog.removeEventListener("close", closed);
    clearInterval(timer);
  };
  const closed = () => {
    if (!body.isConnected || !dialog.open) off();
  };
  document.addEventListener("keydown", keydown);
  dialog.addEventListener("close", closed);
}
function mindmapModal(a) {
  const collapsed = new Set();
  let zoom = 1;
  const viewport = el("div", {
    class: "map-viewport",
    tabindex: 0,
    "aria-label": "Mind map, scroll to pan",
  });
  const draw = () => {
    const tree = (parent) =>
      el(
        "ul",
        { class: "map-tree" },
        a.content.nodes
          .filter((n) => n.parent === parent)
          .map((n) =>
            el(
              "li",
              {},
              el(
                "div",
                { class: "map-node" },
                button(
                  collapsed.has(n.id) ? "+" : "−",
                  () => {
                    collapsed.has(n.id)
                      ? collapsed.delete(n.id)
                      : collapsed.add(n.id);
                    draw();
                  },
                  "quiet small",
                ),
                el("button", { onClick: () => nodeMenu(n) }, n.label),
              ),
              !collapsed.has(n.id) ? tree(n.id) : null,
            ),
          ),
      );
    const treeEl = tree(null);
    treeEl.style.transform = `scale(${zoom})`;
    viewport.replaceChildren(treeEl);
  };
  const save = async () => {
    await api("artifacts/" + a.id, {
      method: "PATCH",
      data: { title: a.title, nodes: a.content.nodes },
    });
    toast("Saved.");
  };
  const nodeMenu = (n) => {
    const label = el("input", { value: n.label, maxlength: 200 });
    modal(
      n.label,
      el(
        "div",
        { class: "stack" },
        markdown(n.detail, a.citations),
        editOnly(field("Rename node", label)),
        el(
          "div",
          { class: "row wrap edit-only" },
          button(
            "Save",
            () =>
              action(async () => {
                n.label = label.value;
                await save();
                mindmapModal(a);
              }),
            "primary",
          ),
          button("Add child", () => {
            a.content.nodes.push({
              id: crypto.randomUUID(),
              parent: n.id,
              label: "New concept",
              detail: "",
              refs: [],
            });
            void action(async () => {
              await save();
              mindmapModal(a);
            });
          }),
          n.parent
            ? button(
                "Delete branch",
                () =>
                  action(async () => {
                    const remove = new Set([n.id]);
                    let size;
                    do {
                      size = remove.size;
                      for (const node of a.content.nodes)
                        if (remove.has(node.parent)) remove.add(node.id);
                    } while (remove.size !== size);
                    a.content.nodes = a.content.nodes.filter(
                      (x) => !remove.has(x.id),
                    );
                    await save();
                    mindmapModal(a);
                  }),
                "danger",
              )
            : null,
          button("Explore this topic", () => {
            $("#dialog").close();
            state.panel = "chat";
            render();
            void sendMessage("Explain " + n.label + " using the sources.");
          }),
        ),
        citationButtons(a.citations.filter((c) => n.refs.includes(c.id))),
      ),
    );
  };
  const range = el("input", {
    type: "range",
    min: 50,
    max: 150,
    value: 100,
    onInput: (e) => {
      zoom = Number(e.target.value) / 100;
      draw();
    },
  });
  draw();
  modal(
    a.title,
    el(
      "div",
      { class: "stack" },
      field("Zoom", range),
      viewport,
      el(
        "div",
        { class: "row" },
        button(
          "Export SVG",
          () => {
            const escape = (value) =>
              value.replace(
                /[&<>"']/g,
                (c) =>
                  ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&apos;",
                  })[c],
              );
            const nodes = a.content.nodes;
            const depth = (n) =>
              n.parent ? 1 + depth(nodes.find((x) => x.id === n.parent)) : 0;
            download(
              a.title + ".svg",
              `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${nodes.length * 55 + 30}"><rect width="100%" height="100%" fill="#fafbfd"/>${nodes.map((n, i) => `<rect x="${20 + depth(n) * 45}" y="${15 + i * 55}" width="650" height="42" rx="7" fill="#e7f2f4"/><text x="${35 + depth(n) * 45}" y="${42 + i * 55}" font-family="Arial" font-size="16" fill="#172f46">${escape(n.label)}</text>`).join("")}</svg>`,
              "image/svg+xml",
            );
          },
          "small",
          "download",
        ),
        button("Export JSON", () => exportArtifact(a), "small"),
      ),
    ),
  );
}
function notebookSettings() {
  const n = state.workspace.notebook;
  const styles = [
    ["Standard Assistant", "Standard assistant"],
    ["Learning Guide", "Learning guide"],
    ["Socratic Tutor", "Socratic tutor"],
    ["Exam Preparation Tutor", "Exam preparation tutor"],
    ["Strict Examiner", "Strict examiner"],
    ["Simplified Explanation", "Simplified explanation"],
    ["Advanced Academic Tutor", "Advanced academic tutor"],
    ["Custom Tutor", "Custom tutor"],
  ];
  const choice = (name, heading, values, current) =>
    el(
      "fieldset",
      {
        class: "folio-choices",
      },
      el("legend", {}, t(heading)),
      el(
        "div",
        { class: "row wrap" },
        values.map(([value, label]) =>
          el(
            "label",
            {},
            el("input", {
              type: "radio",
              name,
              value,
              checked: value === current,
            }),
            el("span", {}, t(label)),
          ),
        ),
      ),
    );
  const language = el(
    "select",
    {},
    outputLanguages.map((s) =>
      el(
        "option",
        { value: s, selected: s === (n.settings.language || "English") },
        s,
      ),
    ),
  );
  const instructions = el("textarea", {
    value: n.settings.instructions || "",
    maxlength: 4000,
    rows: 4,
  });
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          const data = new FormData(form);
          await api("notebooks/" + n.id, {
            method: "PATCH",
            data: {
              settings: {
                style: data.get("style") || "Learning Guide",
                language: language.value,
                answerLength: data.get("length"),
                instructions: instructions.value,
              },
            },
          });
          $("#dialog").close();
          await openNotebook(n.id);
          toast("Saved.");
        });
      },
    },
    choice(
      "style",
      "Teaching style",
      styles,
      n.settings.style || "Learning Guide",
    ),
    choice(
      "length",
      "Answer length",
      [
        ["default", "Default"],
        ["long", "Longer"],
        ["short", "Shorter"],
      ],
      n.settings.answerLength || "default",
    ),
    field("Explanation language", language),
    field("Custom instructions", instructions),
    el(
      "div",
      { class: "dialog-actions" },
      el("button", { class: "button primary", type: "submit" }, t("Save")),
    ),
  );
  modal("Configure chat", form, true);
}

function customizeNotebook(n) {
  const entries = notebookMenu(n);
  modal(
    "Customize notebook",
    el(
      "div",
      { class: "row wrap" },
      ...entries
        .slice(0, 2)
        .map(([label, glyph, run]) => button(label, run, "small", glyph)),
      button("Semantic indexing", semanticModal, "small"),
      isOwner()
        ? button("Delete notebook", entries.at(-1)[2], "small danger", "trash")
        : null,
    ),
  );
}

function semanticModal() {
  const models = el(
    "select",
    {},
    el("option", { value: "" }, t("Embedding model")),
  );
  for (const c of state.connections.filter((c) =>
    ["openai", "openrouter", "ollama"].includes(c.provider),
  ))
    for (const m of c.models.filter((m) => m.capabilities.embeddings))
      models.append(
        el(
          "option",
          { value: JSON.stringify([c.id, m.id]) },
          c.label + " / " + m.id,
        ),
      );
  const status = el("div");
  modal(
    "Semantic indexing",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        { class: "notice" },
        "Optional: selected source text and future search queries will be sent to this embedding provider. This may create additional API charges. Keyword retrieval works without embeddings. Index up to 500 chunks per request.",
      ),
      models,
      status,
      button(
        "Index selected sources",
        () =>
          action(async () => {
            if (!models.value) throw new Error("Choose an embedding model.");
            const [connectionId, model] = JSON.parse(models.value);
            status.replaceChildren(busy("Working…"));
            try {
              const result = await api(
                "notebooks/" + state.activeNotebook + "/embeddings",
                {
                  method: "POST",
                  data: { connectionId, model, sourceIds: [...state.selected] },
                },
              );
              await api("notebooks/" + state.activeNotebook, {
                method: "PATCH",
                data: {
                  settings: {
                    embeddingConnectionId: connectionId,
                    embeddingModel: model,
                  },
                },
              });
              state.workspace.notebook.settings = {
                ...state.workspace.notebook.settings,
                embeddingConnectionId: connectionId,
                embeddingModel: model,
              };
              toast(result.indexed + " chunks indexed.");
              $("#dialog").close();
              render();
            } finally {
              status.replaceChildren();
            }
          }),
        "primary",
      ),
      button("Use keyword retrieval", () =>
        action(async () => {
          await api("notebooks/" + state.activeNotebook, {
            method: "PATCH",
            data: {
              settings: { embeddingConnectionId: null, embeddingModel: null },
            },
          });
          await openNotebook(state.activeNotebook);
          $("#dialog").close();
        }),
      ),
    ),
  );
}
function settingsView() {
  const user = state.user,
    locale = el(
      "select",
      {},
      el("option", { value: "en", selected: state.locale === "en" }, "English"),
      el(
        "option",
        { value: "pt-BR", selected: state.locale === "pt-BR" },
        "Português (Brasil)",
      ),
    ),
    theme = el(
      "select",
      {},
      ["light", "dark"].map((v) =>
        el(
          "option",
          { value: v, selected: v === (user.settings.theme || "light") },
          t(v === "light" ? "Light" : "Dark"),
        ),
      ),
    );
  const form = el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          await api("me", {
            method: "PATCH",
            data: { locale: locale.value, theme: theme.value },
          });
          state.locale = locale.value;
          user.settings = {
            ...user.settings,
            locale: locale.value,
            theme: theme.value,
          };
          localStorage.setItem("folio-locale", locale.value);
          render();
          toast("Saved.");
        });
      },
    },
    field("Interface language", locale),
    field("Theme", theme),
    field(
      "Sources panel width",
      el("input", {
        type: "range",
        min: 220,
        max: 420,
        value:
          parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--sources-width",
            ),
          ) || 300,
        onInput: (e) =>
          document.documentElement.style.setProperty(
            "--sources-width",
            e.target.value + "px",
          ),
      }),
    ),
    field(
      "Study studio width",
      el("input", {
        type: "range",
        min: 260,
        max: 460,
        value:
          parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--studio-width",
            ),
          ) || 340,
        onInput: (e) =>
          document.documentElement.style.setProperty(
            "--studio-width",
            e.target.value + "px",
          ),
      }),
    ),
    el("button", { class: "button primary", type: "submit" }, t("Save")),
  );
  return el(
    "div",
    { class: "stack settings-panel" },
    heading("Settings"),
    el(
      "section",
      { class: "panel stack" },
      el("h2", {}, t("Account")),
      el(
        "div",
        { class: "row wrap" },
        button("Change profile picture", profilePictureModal, "small", "edit"),
        button("Blocked accounts", blockedAccountsModal, "small"),
      ),
    ),
    activeAiPanel(),
    el(
      "section",
      { class: "panel stack" },
      el("h2", {}, t("Study preferences")),
      form,
    ),
    el(
      "section",
      { class: "panel stack" },
      el("h2", {}, t("Your data")),
      el(
        "p",
        { class: "muted small" },
        t(
          "Data is saved on this server. Guest access depends on this browser session.",
        ),
      ),
      el(
        "p",
        { class: "muted small" },
        "Export each notebook from its workspace. Deletion removes active records and uploaded files; backup retention depends on the server administrator.",
      ),
      button(
        "Delete account and data",
        () =>
          confirmAction(
            "Delete account and data",
            "This permanently deletes all your active notebooks, uploads, connections and study history. Export anything you want to keep first.",
            async () => {
              await api("me", { method: "DELETE" });
              location.hash = "";
              location.reload();
            },
          ),
        "danger",
        "trash",
      ),
    ),
    folioVersionPanel(),
    el(
      "section",
      { class: "panel stack" },
      el("h2", {}, "Release scope"),
      el(
        "p",
        { class: "muted small" },
        "Available: notebook sources, YouTube video transcripts, cited chat,guides, flashcards with FSRS spaced repetition and AI explanations, multiple-choice quizzes, turning missed quiz answers into flashcards and flashcard decks into quizzes, mind maps, Markdown notes, data tables, exports, read-only sharing, study groups and communities.",
      ),
      el(
        "p",
        { class: "muted small" },
        "Planned: OCR, image, audio and video file ingestion, audio and video overviews, editable slide decks, advanced quiz formats, MFA, managed KMS and cloud file integrations. English and Brazilian Portuguese interface coverage is partial.",
      ),
    ),
  );
}
function folioVersionPanel() {
  const value = el("strong", { "data-testid": "folio-version" }, "…");
  api("health")
    .then((r) => (value.textContent = "v" + r.version))
    .catch(() => (value.textContent = "unknown"));
  return el(
    "section",
    { class: "panel stack" },
    el("h2", {}, t("Folio version")),
    el("p", { class: "muted small" }, t("You are running Folio"), " ", value),
    desktopUpdates ? updateSettings() : null,
  );
}
// --- Desktop updates ----------------------------------------------------------
// Only the Folio desktop app has these controls (desktop/app-preload.cjs). It
// checks GitHub for new releases. With automatic updates on, the newest one
// installs when Folio quits; with them off, a "New update" button in the top
// bar lists every release that can be installed.
const updatesWaiting = () =>
  Boolean(
    state.updates?.supported &&
    !state.updates.autoUpdate &&
    state.updates.updates.length,
  );
function newUpdateButton(variant) {
  if (!desktopUpdates) return null;
  const count = state.updates?.updates.length || 0;
  const b = button(
    "New update",
    openUpdates,
    "update-button " + variant,
    "download",
  );
  b.dataset.updateButton = "";
  b.hidden = !updatesWaiting();
  if (count > 1) b.append(el("span", { class: "update-count" }, String(count)));
  b.setAttribute(
    "aria-label",
    count > 1 ? `${t("New update")} (${count})` : t("New update"),
  );
  return b;
}
// Refresh the update controls in place, so typing elsewhere is not lost.
function showUpdates(next) {
  if (!next) return;
  state.updates = next;
  for (const old of document.querySelectorAll("[data-update-button]"))
    old.replaceWith(
      newUpdateButton(old.classList.contains("gn-pill") ? "gn-pill" : "small"),
    );
  $("#update-settings")?.replaceWith(updateSettings());
  const list = $("#update-list");
  if (list) list.replaceWith(updateList());
}
function updateStatus(u) {
  if (u.checking) return t("Checking for updates…");
  if (u.installing) return `${t("Downloading")} Folio ${u.installing}…`;
  if (u.error) return t(u.error);
  if (u.ready && u.autoUpdate)
    return `Folio ${u.ready} ${t("will install when you quit Folio.")}`;
  const n = u.updates.length;
  if (n === 1) return t("1 update can be installed.");
  if (n > 1) return `${n} ${t("updates can be installed.")}`;
  return u.checkedAt ? t("Folio is up to date.") : "";
}
function updateSettings() {
  const u = state.updates;
  if (!u) return el("div", { id: "update-settings" });
  const hint = !u.supported
    ? u.blocked === "development"
      ? "Updates work in the installed app. This copy runs from the source code."
      : "This copy of Folio does not update itself. Download new versions from GitHub."
    : u.autoUpdate
      ? "Folio downloads new versions by itself and installs them when you quit."
      : "Folio still checks for new versions. When one is out, a New update button appears in the top bar and you choose when to install it.";
  const answer = el(
    "strong",
    { class: "switch-answer" },
    t(u.autoUpdate ? "Yes" : "No"),
  );
  const toggle = el("input", {
    type: "checkbox",
    role: "switch",
    "data-testid": "auto-update",
    checked: u.autoUpdate,
    disabled: !u.supported,
    onChange: (e) => {
      const on = e.target.checked;
      answer.textContent = t(on ? "Yes" : "No");
      void action(async () => showUpdates(await desktopUpdates.setAuto(on)));
    },
  });
  const status = u.supported ? updateStatus(u) : "";
  return el(
    "div",
    { id: "update-settings", class: "stack" },
    el(
      "label",
      { class: "update-switch" },
      el(
        "span",
        { class: "grow" },
        t("Update automatically"),
        el("small", {}, t(hint)),
      ),
      answer,
      toggle,
    ),
    u.supported
      ? el(
          "div",
          { class: "row update-status" },
          status
            ? el("span", { class: "muted small grow" }, status)
            : el("span", { class: "grow" }),
          updatesWaiting()
            ? button("View updates", openUpdates, "small", "download")
            : null,
          button(
            "Check for updates",
            () => action(async () => showUpdates(await desktopUpdates.check())),
            "small",
            "refresh",
          ),
        )
      : null,
  );
}
function updateList() {
  const u = state.updates;
  const n = u?.updates.length || 0;
  if (!n)
    return el(
      "div",
      { id: "update-list", class: "stack" },
      el("p", {}, t("Folio is up to date. There is nothing to install.")),
    );
  return el(
    "div",
    { id: "update-list", class: "stack" },
    el(
      "p",
      { class: "muted small" },
      `${t("You are running Folio")} v${u.current}. `,
      n === 1
        ? t("1 update can be installed.")
        : `${n} ${t("updates can be installed.")}`,
    ),
    u.updates.map((update, i) => {
      const downloading = u.installing === update.version;
      const install = button(
        downloading ? "Downloading…" : "Install",
        () =>
          action(async () => {
            await desktopUpdates.install(update.version);
            toast("Installing the update. Folio will reopen.");
          }),
        i === 0 ? "primary small" : "small",
        "download",
      );
      install.disabled = Boolean(u.installing);
      return el(
        "article",
        { class: "update-card", "data-testid": "update-card" },
        el(
          "div",
          { class: "row" },
          el(
            "div",
            { class: "grow" },
            el("h3", {}, update.title),
            el(
              "div",
              { class: "row muted small update-meta" },
              el("span", {}, "v" + update.version),
              update.published
                ? el("span", {}, formatDate(update.published))
                : null,
              i === 0 ? el("span", { class: "badge" }, t("Latest")) : null,
            ),
          ),
          install,
        ),
        update.notes
          ? el("div", { class: "update-notes" }, markdown(update.notes))
          : el("p", { class: "muted small" }, t("No release notes.")),
      );
    }),
    el(
      "p",
      { class: "muted small" },
      t(
        "Installing closes Folio, puts the new version in place and opens it again. Your notebooks and settings are kept.",
      ),
    ),
  );
}
function openUpdates() {
  modal("Updates", updateList(), true);
}
if (desktopUpdates) {
  desktopUpdates.onChange(showUpdates);
  void desktopUpdates.get().then(showUpdates, () => {});
}
async function libraryData(kind) {
  const all = await Promise.all(
    state.notebooks.map(async (n) => {
      const data = await api("notebooks/" + n.id);
      return data.artifacts
        .filter((a) => a.kind === kind)
        .map((a) => ({ ...a, notebook: n }));
    }),
  );
  return all.flat();
}
/** Cards due and the concepts missed most, from quizzes and flashcards alike. */
function learningStats() {
  const p = state.progress,
    weak = p.weakConcepts || [];
  return el(
    "section",
    { class: "panel stack fc-stats" },
    el(
      "div",
      { class: "fc-stat" },
      el("strong", {}, p.dueCards ?? 0),
      el("span", { class: "muted" }, t("Cards due")),
      p.newCards
        ? el("span", { class: "muted" }, `· ${p.newCards} ${t("New")}`)
        : null,
    ),
    el("h2", {}, t("Weak concepts")),
    weak.length
      ? el(
          "ul",
          { class: "fc-weak" },
          weak.map((w) =>
            el(
              "li",
              { class: "fc-weak-row" },
              el(
                "button",
                {
                  type: "button",
                  class: "fc-weak-link",
                  onClick: () => nav("notebook/" + w.notebookId),
                },
                el("span", { class: "grow" }, w.label),
                el(
                  "span",
                  { class: "badge" },
                  t(w.source === "quiz" ? "Quiz" : "Cards"),
                ),
                el("small", { class: "muted" }, w.count + "×"),
              ),
              button(
                "Practice",
                () =>
                  action(async () => {
                    await openNotebook(w.notebookId);
                    generateModal("quiz", {
                      difficulty: "adaptive",
                      instructions: `${t("Focus on")}: ${w.label}`,
                    });
                  }),
                "small",
                "quiz",
              ),
            ),
          ),
        )
      : el("p", { class: "muted small" }, t("No weak concepts yet.")),
  );
}
function libraryView() {
  const kind = state.page === "quizzes" ? "quiz" : "flashcards",
    container = el("div", { class: "stack" }, busy("Working…"));
  void action(async () => {
    const all = await libraryData(kind);
    container.replaceChildren(
      ...(all.length
        ? all.map((a) =>
            el(
              "div",
              { class: "panel row between wrap" },
              el(
                "div",
                {},
                el("h3", {}, a.title),
                el("p", { class: "muted small" }, a.notebook.title),
                a.cards
                  ? el(
                      "small",
                      { class: "muted" },
                      // Decks without spaced repetition have no due dates.
                      (a.spaced === false
                        ? []
                        : [
                            `${a.cards.filter((c) => !cardFresh(c) && c.due <= Date.now()).length} ${t("Due now").toLowerCase()}`,
                            `${a.cards.filter(cardFresh).length} ${t("New").toLowerCase()}`,
                          ]
                      )
                        .concat(`${a.cards.length} ${t("Cards").toLowerCase()}`)
                        .join(" / "),
                    )
                  : null,
              ),
              button(
                kind === "quiz" ? "Quiz" : "Flashcards",
                () =>
                  action(async () => {
                    await openNotebook(a.notebook.id);
                    await openArtifact(a.id);
                  }),
                "",
                "chevron",
              ),
            ),
          )
        : [
            empty(
              "No saved resources yet.",
              "Select a notebook",
              button("My notebooks", () => nav("notebooks"), "primary"),
            ),
          ]),
    );
  });
  return el(
    "div",
    { class: "stack" },
    heading(
      state.page === "sessions"
        ? "Study sessions"
        : state.page === "quizzes"
          ? "Quizzes"
          : "Flashcards",
      "Progress comes from practice.",
    ),
    learningStats(),
    container,
  );
}
function progressView() {
  const p = state.progress;
  return el(
    "div",
    { class: "stack" },
    heading("Learning progress", "Progress comes from practice."),
    metrics(p),
    el(
      "section",
      { class: "panel stack" },
      el("h2", {}, "Recall from recorded reviews"),
      p.recall === null
        ? el("p", { class: "muted" }, t("No practice recorded yet."))
        : el(
            "div",
            {},
            el("strong", {}, p.recall + "%"),
            el("progress", {
              value: p.recall,
              max: 100,
              "aria-label": "Flashcard recall percentage",
            }),
            el(
              "p",
              { class: "muted small" },
              `${p.reviews} recorded reviews. Grades of Hard, Good or Easy count as recalled. These are approximate practice indicators, not a precise mastery measurement.`,
            ),
          ),
    ),
    el("h2", {}, "Quiz history"),
    p.attempts.length
      ? el(
          "div",
          { class: "panel" },
          p.attempts.map((q) =>
            el(
              "div",
              { class: "list-row" },
              el(
                "div",
                { class: "row between" },
                el("strong", {}, q.title),
                el("span", { class: "badge" }, q.result.percentage + "%"),
              ),
              el(
                "small",
                { class: "muted" },
                formatDate(q.created) +
                  " / " +
                  q.result.correct +
                  " of " +
                  q.result.total +
                  " correct",
              ),
              q.result.reviewTopics.length
                ? el(
                    "p",
                    { class: "small" },
                    t("Review topics") +
                      ": " +
                      q.result.reviewTopics.join(", "),
                  )
                : null,
            ),
          ),
        )
      : el("p", { class: "muted" }, t("No practice recorded yet.")),
    el("h2", {}, "API usage reported by providers"),
    el(
      "div",
      { class: "panel" },
      p.usage.length
        ? el(
            "div",
            { class: "scroll" },
            el(
              "table",
              { class: "data-table" },
              el(
                "thead",
                {},
                el(
                  "tr",
                  {},
                  [
                    "Provider / model",
                    "Requests",
                    "Input tokens",
                    "Output tokens",
                    "Estimated USD",
                  ].map((h) => el("th", { scope: "col" }, h)),
                ),
              ),
              el(
                "tbody",
                {},
                p.usage.map((u) =>
                  el(
                    "tr",
                    {},
                    [
                      u.provider + " / " + u.model,
                      u.requests,
                      u.inputTokens,
                      u.outputTokens,
                      u.estimatedCost === null
                        ? "Unknown"
                        : "$" + u.estimatedCost.toFixed(4),
                    ].map((value) => el("td", {}, value)),
                  ),
                ),
              ),
            ),
          )
        : el("p", { class: "muted" }, "No generation requests yet."),
      el(
        "p",
        { class: "muted small section-space" },
        "Totals include completed chat and artifact usage reported by providers. Failed requests and embedding charges may be missing. Provider billing is the authority; costs are not guessed.",
      ),
    ),
  );
}
function activityView() {
  return el(
    "div",
    { class: "stack" },
    heading("Recent activity"),
    el(
      "div",
      { class: "panel" },
      state.progress.activity.length
        ? state.progress.activity.map((a) =>
            el(
              "div",
              { class: "activity" },
              el("span", {}, a.event.replaceAll("_", " ")),
              el("span", { class: "muted" }, formatDate(a.created)),
            ),
          )
        : el("p", { class: "muted" }, t("No activity yet.")),
    ),
  );
}
// --- AI in use (Settings) ----------------------------------------------------
function activeAiPanel() {
  const usable = state.connections.filter((c) =>
    c.models.some((m) => m.capabilities.text),
  );
  if (!usable.length)
    return el(
      "section",
      { class: "panel stack" },
      el("h2", {}, t("AI in use")),
      el(
        "p",
        { class: "muted small" },
        t(
          "No AI is connected yet. Add an API key (or sign in) for Claude, GPT or another provider, then choose it here.",
        ),
      ),
      button("AI connections", () => nav("connections"), "small", "plug"),
    );
  const current = activeAi();
  const connection = el(
    "select",
    {
      onChange: () =>
        action(async () => {
          await setActiveAi(connection.value);
          render();
          toast(
            t("Now using") +
              " " +
              usable.find((c) => c.id === connection.value).label,
          );
        }),
    },
    usable.map((c) =>
      el(
        "option",
        { value: c.id, selected: c.id === current?.connectionId },
        `${c.label} — ${providerName(c.provider)}`,
      ),
    ),
  );
  const chosen = usable.find((c) => c.id === current?.connectionId);
  const model = el(
    "select",
    {
      onChange: () =>
        action(async () => {
          await setActiveAi(connection.value, model.value);
          toast("Saved.");
        }),
    },
    (chosen?.models || [])
      .filter((m) => m.capabilities.text)
      .map((m) =>
        el(
          "option",
          { value: m.id, selected: m.id === current?.model },
          m.name,
        ),
      ),
  );
  return el(
    "section",
    { class: "panel stack" },
    el("h2", {}, t("AI in use")),
    el(
      "p",
      { class: "muted small" },
      t(
        "Every notebook uses this AI. Switch whenever you like; each connection remembers the model you last picked for it.",
      ),
    ),
    el(
      "div",
      { class: "form-grid" },
      field("Connection", connection),
      field("Model", model),
    ),
    button("Manage AI connections", () => nav("connections"), "small", "plug"),
  );
}

// --- Shared helpers for social pages ------------------------------------------
/** Render `draw(data)` once `load()` resolves; failures show inline. */
function loadingView(load, draw) {
  const box = el("div", { class: "stack" }, busy("Loading…"));
  void load()
    .then((data) => box.replaceChildren(draw(data)))
    .catch((error) =>
      box.replaceChildren(
        empty(
          "This page is unavailable",
          error.message,
          button("Back", () => history.back(), "small"),
        ),
      ),
    );
  return box;
}
const accessLabel = (access) =>
  ({ owner: "Yours", edit: "Can edit", view: "View only" })[access] ||
  "View only";
function socialCard(n, { meta = [], actions = [] } = {}) {
  return el(
    "article",
    { class: "social-card tint-" + notebookTint(n) },
    el(
      "button",
      {
        type: "button",
        class: "social-open",
        onClick: () => nav("notebook/" + n.id),
      },
      el(
        "span",
        { class: "gn-nb-emoji", "aria-hidden": "true" },
        notebookEmoji(n),
      ),
      el("strong", { class: "social-title" }, n.title),
      n.description
        ? el("small", { class: "social-desc" }, n.description.slice(0, 140))
        : null,
      el(
        "span",
        { class: "social-meta" },
        [n.owner ? `${t("by")} ${n.owner}` : null, ...meta]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    el(
      "div",
      { class: "social-actions" },
      el(
        "span",
        { class: "chip access-" + (n.access || "view") },
        t(accessLabel(n.access)),
      ),
      actions,
    ),
  );
}
function socialGrid(items, emptyText) {
  return items.length
    ? el("div", { class: "social-grid" }, items)
    : el("p", { class: "muted" }, t(emptyText));
}
function emailForm(label, submitLabel, onSubmit) {
  const input = el("input", {
    type: "email",
    required: true,
    maxlength: 254,
    placeholder: "friend@example.com",
  });
  return el(
    "form",
    {
      class: "row wrap social-form",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          await onSubmit(input.value.trim());
          input.value = "";
        });
      },
    },
    el("label", { class: "grow" }, t(label), input),
    el("button", { class: "button primary", type: "submit" }, t(submitLabel)),
  );
}

// --- Read-only sharing --------------------------------------------------------
function shareModal(n) {
  const list = el("div", { class: "stack tight" });
  const draw = async () => {
    const shares = await api(`notebooks/${n.id}/shares`);
    list.replaceChildren(
      ...(shares.length
        ? shares.map((s) =>
            el(
              "div",
              { class: "row between social-person" },
              el(
                "span",
                {},
                el("strong", {}, s.name),
                " ",
                el("span", { class: "muted small" }, s.email),
              ),
              button(
                "Stop sharing",
                () =>
                  action(async () => {
                    await api(`notebooks/${n.id}/shares/${s.userId}`, {
                      method: "DELETE",
                    });
                    await draw();
                  }),
                "small quiet",
              ),
            ),
          )
        : [
            el("p", { class: "muted small" }, t("Not shared with anyone yet.")),
          ]),
    );
  };
  modal(
    "Share “" + n.title + "”",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        { class: "muted small" },
        t(
          "People you share with can open and study this notebook, but they can't change it. They need a Folio account on this server.",
        ),
      ),
      emailForm("Their account email", "Share", async (email) => {
        await api(`notebooks/${n.id}/shares`, {
          method: "POST",
          data: { email },
        });
        toast("Shared.");
        await draw();
      }),
      el("h3", {}, t("Shared with")),
      list,
    ),
  );
  void action(draw);
}
function sharedView() {
  return el(
    "div",
    { class: "stack gn-home" },
    heading(
      "Shared with me",
      "Notebooks friends shared with you, and notebooks from your groups.",
    ),
    loadingView(
      () => Promise.all([api("shared"), api("following")]),
      ([shared, following]) =>
        el(
          "div",
          { class: "stack" },
          socialGrid(
            shared.map((n) =>
              socialCard(n, {
                meta: n.groups.length
                  ? [t("in") + " " + n.groups.join(", ")]
                  : [t("shared directly")],
                actions: [
                  button(
                    "Block",
                    () => blockAccount(n.ownerId, render),
                    "small quiet",
                  ),
                ],
              }),
            ),
            "Nothing has been shared with you yet. When a friend shares a notebook or adds one to your group, it appears here automatically.",
          ),
          el(
            "div",
            { class: "gn-section-head" },
            el("h2", {}, t("Notebooks you follow")),
          ),
          socialGrid(
            following.map((n) =>
              socialCard(n, {
                meta: [n.community],
                actions:
                  n.ownerId === state.user.id
                    ? []
                    : [
                        button(
                          "Block",
                          () => blockAccount(n.ownerId, render),
                          "small quiet",
                        ),
                      ],
              }),
            ),
            "Follow notebooks in a community to keep them here.",
          ),
        ),
    ),
  );
}

// --- Groups ---------------------------------------------------------------------
function groupForm(group = null, onSaved) {
  const name = el("input", {
      required: true,
      maxlength: 120,
      value: group?.name || "",
      placeholder: "e.g. Biology study crew",
    }),
    editable = el(
      "select",
      {},
      el(
        "option",
        { value: "false", selected: !group?.editable },
        t("View only — members study each other's notebooks"),
      ),
      el(
        "option",
        { value: "true", selected: Boolean(group?.editable) },
        t("Editable — members can edit every notebook in the group"),
      ),
    );
  return el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          const data = {
            name: name.value.trim(),
            editable: editable.value === "true",
          };
          const result = group
            ? await api("groups/" + group.id, { method: "PATCH", data })
            : await api("groups", { method: "POST", data });
          $("#dialog").close();
          onSaved(result);
        });
      },
    },
    field("Group name", name),
    field("Notebooks in this group are", editable),
    el(
      "button",
      { class: "button primary", type: "submit" },
      t(group ? "Save" : "Create group"),
    ),
  );
}
function groupsView() {
  return el(
    "div",
    { class: "stack gn-home" },
    heading(
      "Groups",
      "Study with friends. Notebooks put in a group reach every member automatically.",
      button(
        "New group",
        () =>
          modal(
            "New group",
            groupForm(null, (r) => nav("group/" + r.id)),
          ),
        "gn-pill gn-dark",
        "plus",
      ),
    ),
    loadingView(
      () => api("groups"),
      (groups) =>
        groups.length
          ? el(
              "div",
              { class: "social-grid" },
              groups.map((g) =>
                el(
                  "article",
                  { class: "social-card tint-sky" },
                  el(
                    "button",
                    {
                      type: "button",
                      class: "social-open",
                      onClick: () => nav("group/" + g.id),
                    },
                    el(
                      "span",
                      { class: "gn-nb-emoji", "aria-hidden": "true" },
                      "👥",
                    ),
                    el("strong", { class: "social-title" }, g.name),
                    el(
                      "span",
                      { class: "social-meta" },
                      [
                        plural(g.memberCount, "member", "members"),
                        plural(g.notebookCount, "notebook", "notebooks"),
                        g.role === "owner"
                          ? t("you created it")
                          : `${t("by")} ${g.owner}`,
                      ].join(" · "),
                    ),
                  ),
                  el(
                    "div",
                    { class: "social-actions" },
                    el(
                      "span",
                      {
                        class: "chip access-" + (g.editable ? "edit" : "view"),
                      },
                      t(g.editable ? "Editable" : "View only"),
                    ),
                  ),
                ),
              ),
            )
          : empty(
              "No groups yet",
              "Create a group, add your friends by email, then put your notebooks in it.",
              null,
              "users",
            ),
    ),
  );
}
function addToGroupModal(n) {
  const body = el("div", { class: "stack" }, busy("Loading…"));
  modal("Add “" + n.title + "” to a group", body);
  void action(async () => {
    const groups = await api("groups");
    body.replaceChildren(
      el(
        "p",
        { class: "muted small" },
        t("Every member of the group gets this notebook automatically."),
      ),
      ...(groups.length
        ? groups.map((g) =>
            el(
              "div",
              { class: "row between social-person" },
              el(
                "span",
                {},
                el("strong", {}, g.name),
                " ",
                el(
                  "span",
                  { class: "muted small" },
                  t(g.editable ? "Editable" : "View only"),
                ),
              ),
              button(
                "Add",
                () =>
                  action(async () => {
                    await api(`groups/${g.id}/notebooks`, {
                      method: "POST",
                      data: { notebookId: n.id },
                    });
                    $("#dialog").close();
                    toast("Added to " + g.name + ".");
                  }),
                "small primary",
              ),
            ),
          )
        : [
            el("p", { class: "muted" }, t("You are not in any group yet.")),
            button(
              "New group",
              () =>
                modal(
                  "New group",
                  groupForm(null, (r) => nav("group/" + r.id)),
                ),
              "small",
              "plus",
            ),
          ]),
    );
  });
}
function groupView(id) {
  const reload = () => render();
  return loadingView(
    () => api("groups/" + id),
    (g) => {
      const owner = g.role === "owner";
      const myIds = new Set(g.notebooks.map((n) => n.id));
      const addable = state.notebooks.filter((n) => !myIds.has(n.id));
      const picker = el(
        "select",
        { "aria-label": t("Choose one of your notebooks") },
        addable.map((n) => el("option", { value: n.id }, n.title)),
      );
      return el(
        "div",
        { class: "stack gn-home" },
        heading(
          g.group.name,
          g.group.editable
            ? "Members can edit every notebook in this group."
            : "Members can open and study every notebook in this group, but only owners edit them.",
          el(
            "div",
            { class: "row wrap" },
            owner
              ? button(
                  "Group settings",
                  () => modal("Group settings", groupForm(g.group, reload)),
                  "gn-pill",
                  "settings",
                )
              : null,
            owner
              ? button(
                  "Delete group",
                  () =>
                    confirmAction(
                      "Delete group",
                      "Members lose access to the group's notebooks. The notebooks themselves stay with their owners.",
                      async () => {
                        await api("groups/" + id, { method: "DELETE" });
                        nav("groups");
                      },
                    ),
                  "gn-pill danger",
                  "trash",
                )
              : button(
                  "Leave group",
                  () =>
                    confirmAction(
                      "Leave group",
                      "You will stop receiving this group's notebooks, and your notebooks leave the group.",
                      async () => {
                        await api(`groups/${id}/members/${state.user.id}`, {
                          method: "DELETE",
                        });
                        nav("groups");
                      },
                      "Leave",
                    ),
                  "gn-pill",
                  "logout",
                ),
          ),
        ),
        el("div", { class: "gn-section-head" }, el("h2", {}, t("Notebooks"))),
        addable.length
          ? el(
              "form",
              {
                class: "row wrap social-form",
                onSubmit: (e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api(`groups/${id}/notebooks`, {
                      method: "POST",
                      data: { notebookId: picker.value },
                    });
                    reload();
                  });
                },
              },
              el(
                "label",
                { class: "grow" },
                t("Put one of your notebooks in the group"),
                picker,
              ),
              el(
                "button",
                { class: "button primary", type: "submit" },
                t("Add notebook"),
              ),
            )
          : null,
        socialGrid(
          g.notebooks.map((n) =>
            socialCard(n, {
              actions:
                owner || n.mine
                  ? [
                      iconButton("close", "Remove from group", () =>
                        action(async () => {
                          await api(`groups/${id}/notebooks/${n.id}`, {
                            method: "DELETE",
                          });
                          reload();
                        }),
                      ),
                    ]
                  : [],
            }),
          ),
          "No notebooks in this group yet.",
        ),
        el("div", { class: "gn-section-head" }, el("h2", {}, t("Members"))),
        owner
          ? emailForm(
              "Add a friend by their account email",
              "Add member",
              async (email) => {
                await api(`groups/${id}/members`, {
                  method: "POST",
                  data: { email },
                });
                toast("Member added.");
                reload();
              },
            )
          : null,
        el(
          "div",
          { class: "panel stack tight" },
          g.members.map((m) =>
            el(
              "div",
              { class: "row between social-person" },
              el(
                "span",
                {},
                el("strong", {}, m.name),
                " ",
                el(
                  "span",
                  { class: "muted small" },
                  m.role === "owner" ? t("created the group") : m.email || "",
                ),
              ),
              el(
                "div",
                { class: "row wrap" },
                m.userId !== state.user.id
                  ? button(
                      "Block",
                      () =>
                        blockAccount(
                          m.userId,
                          m.role === "owner" ? () => nav("groups") : reload,
                        ),
                      "small quiet",
                    )
                  : null,
                owner && m.role !== "owner"
                  ? button(
                      "Remove",
                      () =>
                        action(async () => {
                          await api(`groups/${id}/members/${m.userId}`, {
                            method: "DELETE",
                          });
                          reload();
                        }),
                      "small quiet",
                    )
                  : null,
              ),
            ),
          ),
        ),
      );
    },
  );
}

// --- Communities ---------------------------------------------------------------
function communityForm(c = null, onSaved) {
  const name = el("input", {
      required: true,
      maxlength: 120,
      value: c?.name || "",
      placeholder: "e.g. AP Biology notes",
    }),
    description = el("textarea", {
      rows: 3,
      maxlength: 1000,
      value: c?.description || "",
      placeholder: "What will you publish here?",
    });
  return el(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void action(async () => {
          const data = {
            name: name.value.trim(),
            description: description.value.trim(),
          };
          const result = c
            ? await api("communities/" + c.id, { method: "PATCH", data })
            : await api("communities", { method: "POST", data });
          $("#dialog").close();
          onSaved(result);
        });
      },
    },
    field("Community name", name),
    field("Description", description),
    el(
      "p",
      { class: "muted small" },
      t(
        "You will be the community's president: only you can publish notebooks. Anyone on this server can follow it, read its notebooks and like them.",
      ),
    ),
    el(
      "button",
      { class: "button primary", type: "submit" },
      t(c ? "Save" : "Create community"),
    ),
  );
}
const followButton = (following, path, after) =>
  button(
    following ? "Following" : "Follow",
    () =>
      action(async () => {
        await api(path, {
          method: following ? "DELETE" : "POST",
          data: following ? undefined : {},
        });
        after();
      }),
    following ? "small" : "small primary",
    following ? "check" : "plus",
  );
function communitiesView() {
  const results = el("div", { class: "stack" });
  let query = "";
  const draw = () =>
    results.replaceChildren(
      loadingView(
        () => api("communities?q=" + encodeURIComponent(query)),
        (list) =>
          list.length
            ? el(
                "div",
                { class: "social-grid" },
                list.map((c) =>
                  el(
                    "article",
                    { class: "social-card tint-mint" },
                    el(
                      "button",
                      {
                        type: "button",
                        class: "social-open",
                        onClick: () => nav("community/" + c.id),
                      },
                      el(
                        "span",
                        { class: "gn-nb-emoji", "aria-hidden": "true" },
                        "🌐",
                      ),
                      el("strong", { class: "social-title" }, c.name),
                      c.description
                        ? el(
                            "small",
                            { class: "social-desc" },
                            c.description.slice(0, 140),
                          )
                        : null,
                      el(
                        "span",
                        { class: "social-meta" },
                        [
                          `${t("President")}: ${c.isPresident ? t("you") : c.president}`,
                          plural(c.followers, "follower", "followers"),
                          plural(c.notebookCount, "notebook", "notebooks"),
                        ].join(" · "),
                      ),
                    ),
                    el(
                      "div",
                      { class: "social-actions" },
                      c.isPresident
                        ? el(
                            "span",
                            { class: "chip access-owner" },
                            t("President"),
                          )
                        : followButton(
                            c.following,
                            `communities/${c.id}/follow`,
                            draw,
                          ),
                    ),
                  ),
                ),
              )
            : empty(
                query ? "No matching communities" : "No communities yet",
                "Start one to publish your notebooks for others to follow.",
                null,
                "globe",
              ),
      ),
    );
  draw();
  return el(
    "div",
    { class: "stack gn-home" },
    heading(
      "Communities",
      "Follow people who publish notebooks, then like or follow the notebooks you study.",
      button(
        "New community",
        () =>
          modal(
            "New community",
            communityForm(null, (r) => nav("community/" + r.id)),
          ),
        "gn-pill gn-dark",
        "plus",
      ),
    ),
    el(
      "label",
      { class: "gn-search" },
      icon("search"),
      el("input", {
        type: "search",
        placeholder: t("Search communities"),
        "aria-label": t("Search communities"),
        onChange: (e) => {
          query = e.target.value;
          draw();
        },
      }),
    ),
    results,
  );
}
function publishModal(n) {
  const body = el("div", { class: "stack" }, busy("Loading…"));
  modal("Publish “" + n.title + "”", body);
  void action(async () => {
    const mine = (await api("communities")).filter((c) => c.isPresident);
    body.replaceChildren(
      el(
        "p",
        { class: "muted small" },
        t(
          "Published notebooks are view only for everyone else. Only community presidents can publish.",
        ),
      ),
      ...(mine.length
        ? mine.map((c) =>
            el(
              "div",
              { class: "row between social-person" },
              el("strong", {}, c.name),
              button(
                "Publish",
                () =>
                  action(async () => {
                    await api(`communities/${c.id}/notebooks`, {
                      method: "POST",
                      data: { notebookId: n.id },
                    });
                    $("#dialog").close();
                    toast("Published to " + c.name + ".");
                  }),
                "small primary",
              ),
            ),
          )
        : [
            el(
              "p",
              { class: "muted" },
              t("You are not the president of any community."),
            ),
            button(
              "New community",
              () =>
                modal(
                  "New community",
                  communityForm(null, (r) => nav("community/" + r.id)),
                ),
              "small",
              "plus",
            ),
          ]),
    );
  });
}
function communityView(id) {
  const reload = () => render();
  return loadingView(
    () => api("communities/" + id),
    (c) => {
      const president = c.isPresident;
      const published = new Set(c.notebooks.map((n) => n.id));
      const addable = state.notebooks.filter((n) => !published.has(n.id));
      const picker = el(
        "select",
        { "aria-label": t("Choose one of your notebooks") },
        addable.map((n) => el("option", { value: n.id }, n.title)),
      );
      const base = `communities/${id}/notebooks/`;
      return el(
        "div",
        { class: "stack gn-home" },
        heading(
          c.community.name,
          c.community.description || "",
          el(
            "div",
            { class: "row wrap" },
            el(
              "span",
              { class: "chip" },
              `${t("President")}: ${president ? t("you") : c.community.president} · ${plural(c.followers, "follower", "followers")}`,
            ),
            president
              ? [
                  button(
                    "Edit community",
                    () =>
                      modal(
                        "Edit community",
                        communityForm({ id, ...c.community }, reload),
                      ),
                    "gn-pill",
                    "edit",
                  ),
                  button(
                    "Delete community",
                    () =>
                      confirmAction(
                        "Delete community",
                        "Followers lose access to its notebooks. The notebooks stay in your library.",
                        async () => {
                          await api("communities/" + id, { method: "DELETE" });
                          nav("communities");
                        },
                      ),
                    "gn-pill danger",
                    "trash",
                  ),
                ]
              : [followButton(c.following, `communities/${id}/follow`, reload),
                  button("Block", () => blockAccount(c.community.presidentId, () => nav("communities")), "gn-pill")],
          ),
        ),
        president && addable.length
          ? el(
              "form",
              {
                class: "row wrap social-form",
                onSubmit: (e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api(`communities/${id}/notebooks`, {
                      method: "POST",
                      data: { notebookId: picker.value },
                    });
                    reload();
                  });
                },
              },
              el(
                "label",
                { class: "grow" },
                t("Publish one of your notebooks"),
                picker,
              ),
              el(
                "button",
                { class: "button primary", type: "submit" },
                t("Publish"),
              ),
            )
          : null,
        socialGrid(
          c.notebooks.map((n) =>
            socialCard(n, {
              meta: [
                plural(n.likes, "like", "likes"),
                plural(n.followers, "follower", "followers"),
              ],
              actions: [
                el(
                  "button",
                  {
                    type: "button",
                    class:
                      "icon-button like-button" + (n.liked ? " liked" : ""),
                    "aria-pressed": String(n.liked),
                    title: t(n.liked ? "Unlike" : "Like"),
                    "aria-label": t(n.liked ? "Unlike" : "Like"),
                    onClick: () =>
                      action(async () => {
                        await api(base + n.id + "/like", {
                          method: n.liked ? "DELETE" : "POST",
                          data: n.liked ? undefined : {},
                        });
                        reload();
                      }),
                  },
                  icon("heart"),
                ),
                followButton(n.followed, base + n.id + "/follow", reload),
                president
                  ? iconButton("close", "Remove from community", () =>
                      action(async () => {
                        await api(base + n.id, { method: "DELETE" });
                        reload();
                      }),
                    )
                  : null,
              ],
            }),
          ),
          president
            ? "Publish your first notebook above."
            : "This community has not published any notebooks yet.",
        ),
      );
    },
  );
}
// --- Knowledge graph ---------------------------------------------------------
const resourceLabels = {
  audio: "Audio overview",
  slides: "Slide deck",
  mindmap: "Mind map",
  flashcards: "Flashcards",
  quiz: "Quiz",
  table: "Data table",
  guide: "Study guide",
  infographic: "Infographic",
  note: "Note",
};
const graphKinds = [
  ["source", "Sources"],
  ["resource", "Resources"],
  ["topic", "Topics"],
];
const graphDot = (kind) =>
  el("span", { class: "graph-dot kind-" + kind, "aria-hidden": "true" });
function graphNodeKind(node) {
  if (node.kind === "source")
    return `${t("Source")} · ${formatLabels[node.type] || String(node.type || "").toUpperCase()}`;
  if (node.kind === "resource") return t(resourceLabels[node.type] || "Note");
  return t(node.kind === "topic" ? "Topic" : "Notebook");
}
async function openGraphNode(node) {
  if (node.kind === "topic") return;
  if (node.kind === "notebook") return nav("notebook/" + node.ref);
  // Keep the address in step with the page so Back returns to the graph.
  history.pushState(null, "", "#notebook/" + node.notebookId);
  await openNotebook(node.notebookId);
  await (node.kind === "source"
    ? sourceModal(node.ref)
    : openArtifact(node.ref));
}
/** One view, two scopes: every owned notebook, or a single notebook. */
function graphView() {
  const scope = state.pageId || "";
  const hidden = new Set(
    stored("folio-graph-hidden", "").split(",").filter(Boolean),
  );
  let graph = null;
  const stage = el("div", { class: "graph-stage" }, busy("Working…"));
  const count = el("span", { class: "gn-count", role: "status" });
  const detail = el("aside", { class: "graph-detail hidden" });
  const scopeSelect = el(
    "select",
    {
      class: "graph-scope",
      "aria-label": t("Graph scope"),
      onChange: (e) =>
        nav(e.target.value ? "graph/" + e.target.value : "graph"),
    },
    el("option", { value: "", selected: !scope }, t("All notebooks")),
    state.notebooks.map((n) =>
      el("option", { value: n.id, selected: n.id === scope }, n.title),
    ),
  );
  const search = el("input", {
    type: "search",
    placeholder: t("Search the graph"),
    "aria-label": t("Search the graph"),
    onInput: () => applySearch(),
    onKeydown: (e) => {
      const first = e.key === "Enter" && graph?.firstMatch();
      if (first) graph.focus(first.id);
    },
  });
  function updateCount() {
    const shown = graph.nodes.filter((n) => n.visible).length,
      lines = graph.links.filter(
        (l) => l.source.visible && l.target.visible,
      ).length;
    count.textContent = `${plural(shown, "node", "nodes")} · ${plural(lines, "link", "links")}`;
  }
  function applySearch() {
    const query = search.value.trim().toLowerCase();
    graph?.setMatch(
      query ? (n) => n.label.toLowerCase().includes(query) : null,
    );
  }
  function applyFilter() {
    if (!graph) return;
    graph.setVisible((n) => !hidden.has(n.kind));
    applySearch();
    updateCount();
  }
  const toggles = graphKinds.map(([kind, label]) => {
    const toggle = el(
      "button",
      {
        type: "button",
        class: "graph-toggle",
        "aria-pressed": String(!hidden.has(kind)),
        onClick: () => {
          if (!hidden.delete(kind)) hidden.add(kind);
          toggle.setAttribute("aria-pressed", String(!hidden.has(kind)));
          store("folio-graph-hidden", [...hidden].join(","));
          applyFilter();
        },
      },
      graphDot(kind),
      t(label),
    );
    return toggle;
  });
  function showDetail(node) {
    detail.classList.toggle("hidden", !node);
    if (!node) return detail.replaceChildren();
    const near = graph.neighbours(node);
    const home =
      !scope && (node.kind === "source" || node.kind === "resource")
        ? graph.nodes.find((n) => n.id === "n:" + node.notebookId)
        : null;
    detail.replaceChildren(
      el(
        "div",
        { class: "row between" },
        el("span", { class: "chip" }, graphDot(node.kind), graphNodeKind(node)),
        iconButton("close", "Close", () => graph.select(null)),
      ),
      el("h3", {}, node.label),
      home ? el("p", { class: "muted small" }, home.label) : null,
      node.kind === "topic"
        ? null
        : button(
            node.kind === "notebook"
              ? "Open notebook"
              : node.kind === "source"
                ? "Open source"
                : "Open resource",
            () => action(() => openGraphNode(node)),
            "primary small",
            "arrow",
          ),
      el(
        "p",
        { class: "graph-detail-heading" },
        `${t("Connections")} (${near.length})`,
      ),
      near.length
        ? el(
            "ul",
            { class: "graph-links" },
            near.map((n) =>
              el(
                "li",
                {},
                el(
                  "button",
                  {
                    type: "button",
                    class: "graph-link",
                    title: graphNodeKind(n),
                    onClick: () => graph.focus(n.id),
                  },
                  graphDot(n.kind),
                  el("span", {}, n.label),
                ),
              ),
            ),
          )
        : el("p", { class: "muted small" }, t("No connections yet.")),
    );
  }
  void (async () => {
    const data = await action(() =>
      api(scope ? `notebooks/${scope}/graph` : "graph"),
    );
    if (!data)
      return stage.replaceChildren(
        empty(
          "Graph unavailable.",
          "This notebook could not be loaded.",
          button("All notebooks", () => nav("graph")),
          "graph",
        ),
      );
    if (!data.nodes.length)
      return stage.replaceChildren(
        empty(
          "Nothing to map yet.",
          "Create a notebook and add sources to see how your material connects.",
          button("New notebook", newNotebook, "primary", "plus"),
          "graph",
        ),
      );
    // A notebook shared with this account is not in the owned list.
    const hub = data.nodes.find((n) => n.id === "n:" + scope);
    if (hub && !state.notebooks.some((n) => n.id === scope))
      scopeSelect.append(
        el("option", { value: scope, selected: true }, hub.label),
      );
    const canvas = el("canvas", {
      class: "graph-canvas",
      tabindex: 0,
      role: "application",
      "aria-label": t(
        "Knowledge graph. Drag to move, scroll to zoom, select an item to see its connections.",
      ),
    });
    graph = createGraph(canvas, data, {
      onSelect: showDetail,
      onOpen: (node) => void action(() => openGraphNode(node)),
    });
    stage.replaceChildren(
      canvas,
      el(
        "div",
        { class: "graph-zoom" },
        iconButton("plus", "Zoom in", () => graph.zoom(1.3)),
        iconButton("minus", "Zoom out", () => graph.zoom(1 / 1.3)),
        iconButton("fit", "Fit to view", () => graph.fit()),
      ),
      el(
        "p",
        { class: "graph-hint" },
        t(
          data.nodes.some((n) => n.kind !== "notebook")
            ? "Drag to move · scroll to zoom · double-click to open"
            : "Add sources and create study resources to grow this graph.",
        ),
      ),
      detail,
    );
    applyFilter();
  })();
  return el(
    "div",
    { class: "graph-page" },
    heading(
      "Knowledge graph",
      "See how your sources, saved resources and topics connect.",
      el(
        "div",
        { class: "row graph-scope-row" },
        scopeSelect,
        scope
          ? button("Open notebook", () => nav("notebook/" + scope), "", "arrow")
          : null,
      ),
    ),
    el(
      "div",
      { class: "graph-toolbar" },
      el("label", { class: "gn-search" }, icon("search"), search),
      el(
        "div",
        { class: "graph-toggles", role: "group", "aria-label": t("Graph") },
        graphDot("notebook"),
        el("span", { class: "graph-legend-label" }, t("Notebooks")),
        toggles,
      ),
      el("span", { class: "grow" }),
      count,
    ),
    stage,
  );
}
window.addEventListener("hashchange", () => void action(route));
$("#dialog").addEventListener("click", (e) => {
  if (e.target === $("#dialog")) {
    const rect = e.target.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      e.target.close();
  }
});
setInterval(() => {
  if (
    state.user &&
    state.page === "notebook" &&
    state.workspace?.sources.some((s) =>
      ["queued", "processing"].includes(s.status),
    ) &&
    !state.busy &&
    !$("#dialog").open
  ) {
    const previous = new Set(
      state.workspace.sources
        .filter((s) => s.status === "ready")
        .map((s) => s.id),
    );
    void action(async () => {
      const data = await api("notebooks/" + state.activeNotebook);
      for (const source of data.sources)
        if (source.status === "ready" && !previous.has(source.id))
          state.selected.add(source.id);
      state.workspace = keepUnsavedEffort(data);
      render();
    });
  }
}, 2000);
try {
  const session = await api("me");
  if (session.user) {
    state.user = session.user;
    state.csrf = session.csrf;
    state.locale = state.user.settings.locale || state.locale;
    await route();
  } else renderAuth();
} catch (error) {
  $("#app").replaceChildren(
    empty(
      "Folio could not load",
      error.message,
      button("Try again", () => location.reload(), "primary"),
    ),
  );
}
