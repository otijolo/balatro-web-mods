# Balatro Web com mods

Versão experimental baseada em [W0W53R/web-balatro](https://github.com/W0W53R/web-balatro), para montar e executar **sua própria cópia** do Balatro no navegador com o perfil local do r2modman.

O site não fornece o jogo, os mods ou os dumps. A montagem ocorre no navegador e as versões ficam no IndexedDB. Nenhum arquivo selecionado é enviado ao servidor.

## Usar

1. Inicie o Balatro pelo r2modman com os mods desejados e feche o jogo. Isso gera o dump do Lovely.
2. Com Python 3.11+, execute na pasta deste projeto:

   ```powershell
   python preparar-perfil.py --saida perfil-local.zip
   ```

   Para outro perfil:

   ```powershell
   python preparar-perfil.py --perfil "CAMINHO/DO/PERFIL" --saida perfil-local.zip
   ```

3. Abra o site, selecione seu `Balatro.exe` e o ZIP do perfil, dê um nome e clique em **Montar versão**.
4. Clique em **Jogar**. Use **Baixar** para guardar uma cópia pessoal da versão montada.

Para servir o site localmente: `python -m http.server 8766 --bind 127.0.0.1`. Acesse `http://127.0.0.1:8766/`.

## Publicação

Pode hospedar os arquivos deste repositório em um serviço estático, incluindo GitHub Pages. O workflow usa uma lista explícita de arquivos públicos. Nunca publique `Balatro.exe`, arquivos `.love`, exports de perfil, saves, `Mods/`, `dump/` ou o pacote gerado pelo botão de download. O export de perfil contém código do jogo no dump do Lovely, mesmo sem conter o EXE.

No GitHub, selecione **Settings → Pages → Source → GitHub Actions**. A licença MIT e os créditos da base devem ser mantidos. As bibliotecas mantêm suas licenças próprias. A inclusão de mods em uma distribuição pública exige analisar as licenças deles; este repositório não os distribui.

## Compatibilidade e limites

O adaptador foi desenvolvido para os arquivos locais de Balatro **1.0.1o**, Lovely **0.10.0**, Steamodded **26.1002.0**, Amulet **3.6.1**, Cryptid **0.5.17c**, Omegatro **1.0.1** e Balatro+ **1.0.2-a**. Outras versões podem exigir novos ajustes. O dump precisa corresponder aos mods e à versão do jogo usados para gerá-lo.

- Reconstrói módulos do Lovely, aplica o dump e adapta caminhos de arquivos à sandbox do navegador.
- Adapta os saltos `goto` conhecidos e a representação FFI de OmegaNum para Lua 5.1.
- Reescreve comparações numéricas pela árvore de sintaxe e preserva as regras de NaN de OmegaNum.
- Adapta shaders para WebGL e sons dos mods ao áudio sem threads nativas.
- O coringa de espaço livre no disco do Omegatro fica fora do sorteio, pois o navegador não acessa PowerShell. HTTP nativo e integrações Steam não estão disponíveis.
- O pacote local do Omegatro referencia `labubu.ogg`, ausente nessa instalação. Esse efeito sonoro fica silencioso, com aviso no diagnóstico.
- Saves são separados por nome de versão e endereço do site. Limpar dados do navegador remove as versões e os saves locais. Saves da Steam não são importados automaticamente.
- O progresso é sincronizado a cada 10 segundos. Use **Salvar progresso** antes de fechar a aba para confirmar a gravação mais recente.
- O gerador aleatório web pode produzir resultados diferentes dos da versão nativa, inclusive com a mesma seed.
- Mudar mods durante o jogo e recarregar patches do Lovely exige reconstruir a versão.

O jogo tem muitos conteúdos e combinações possíveis. Um teste de inicialização e uma rodada não garantem compatibilidade de todas as cartas e efeitos.

## Créditos e licenças

- Base do site: W0W53R, MIT, em `license.txt`.
- Motor: [love.js](https://github.com/2dengine/love.js) / LÖVE.
- Parser: [luaparse](https://github.com/fstirlitz/luaparse), MIT, em `lib/luaparse.LICENSE`.
- JSZip: licença incluída no cabeçalho de `lib/jszip.min.js`.
- Balatro é de LocalThunk / Playstack. Este é um projeto independente.
- Instruções originais da base em `README-original.md`.
