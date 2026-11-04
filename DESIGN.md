# 見た目をカスタマイズする

personal-dashboard の見た目（色・フォント・カードの形・テーマなど）を変える方法です。
セットアップは [README.md](README.md)、使い方は [USAGE.md](USAGE.md)、アドオン（自作ウィジェット）の作り方は [WIDGET.md](WIDGET.md) を見てください。

CSS は役割ごとにファイルを分け、[カスケードレイヤー（`@layer`）](https://developer.mozilla.org/ja/docs/Web/CSS/@layer)で
優先順位を固定しています。後ろのレイヤーほど強く、**詳細度（セレクターの強さ）を気にせず上書きできます**。

```
tokens  <  base  <  layout  <  components  <  themes  <  custom
```

| ファイル | 中身 | 編集の目安 |
|---|---|---|
| `public/css/tokens.css` | 色・フォント・余白・角丸・列数などの **CSS 変数** | 本家の標準値。直接変えてもよい |
| `public/css/base.css` | リセットと文字の基本設定 | ふつうは触らない |
| `public/css/layout.css` | ヘッダー・グリッド・レスポンシブ | 列の割り当てを変えたいとき |
| `public/css/components.css` | ウィジェット・リンク・ボタン・ダイアログ | 部品の形を変えたいとき |
| `public/css/themes.css` | 設定画面で選べるテーマ（変数の上書きだけで作っています） | テーマを増やしたいとき |
| `public/css/custom.css` | **あなた専用の上書き用（初期状態は空）** | **まずはここに書く** |

アドオン（[WIDGET.md](WIDGET.md)）に書いた `css` は `components` レイヤーに入るので、テーマや `custom.css` からそのまま上書きできます。

## いちばん簡単な方法：custom.css で変数を上書きする

ほとんどの見た目は CSS 変数で決まっているので、`custom.css` で変数を上書きするだけで変わります。

```css
@layer custom {
  :root {
    /* light-dark(ライトモードの色, ダークモードの色) */
    --color-accent: light-dark(#7a3fb0, #c9a2f0);
    --color-bg:     light-dark(#f7f4fb, #15121a);
    --radius-lg: 20px;
    --grid-columns: 5;   /* 広い画面での列数 */
    --font-heading: var(--font-serif);   /* 見出しだけ明朝体に */
  }
}
```

ここで書いた値は、どのテーマを選んでいても優先されます。
特定のテーマのときだけ変えたい場合は `:root[data-preset="glass"] { ... }` のように書きます。

本家は `custom.css` を空のまま保つので、本家の更新を取り込むときに衝突しません。

## 主な CSS 変数

| 変数 | 意味 |
|---|---|
| `--color-bg` / `--color-surface` | ページの背景色 / カードの背景色 |
| `--color-surface-muted` / `--color-surface-hover` | 控えめな面（タイル・メモ欄）/ ホバー時 |
| `--color-text` / `--color-text-muted` | 文字色 / 補足の文字色 |
| `--color-accent` / `--color-accent-contrast` | アクセント色 / その上に載せる文字色 |
| `--color-border` / `--color-danger` / `--color-focus` | 枠線 / 削除ボタン / フォーカス枠 |
| `--font-sans` / `--font-serif` / `--font-mono` | 本文 / 明朝体 / 等幅のフォント（すべて各 OS の標準フォント） |
| `--font-heading` | 見出し（ダッシュボード名・ウィジェット名）のフォント |
| `--font-size-*`（`xs` `sm` `md` `lg` `xl` `clock`） | 文字サイズ |
| `--space-1` 〜 `--space-6` | 余白の段階（4px 〜 32px） |
| `--radius-sm` / `--radius-md` / `--radius-lg` | 角丸 |
| `--shadow-widget` / `--shadow-raised` | ウィジェット / ダイアログ・ドラッグ中の影 |
| `--page-max-width` / `--page-gutter` | ページの最大幅 / 画面端の余白 |
| `--footer-height` | 画面の下に固定したフッターの高さ |
| `--grid-columns` / `--grid-gap` | 広い画面での列数 / ウィジェットの間隔 |
| `--grid-row-height` | タイル表示の 1 段の高さ（標準 150px、表示密度「コンパクト」では 140px） |
| `--widget-padding` | ウィジェット内側の余白 |
| `--link-tile-min` / `--icon-size` / `--icon-size-tile` | タイル 1 個の最小幅 / アイコンの大きさ |
| `--widget-accent` | ウィジェットごとの色（✎ で設定した色が入る。未設定なら `--color-accent`） |

ページやカードの「形」を決める変数もあります。テーマはこれらの組み合わせでできています。

| 変数 | 意味 | 例 |
|---|---|---|
| `--page-bg` | ページの背景（グラデーションや画像も可） | `radial-gradient(...), var(--color-bg)` |
| `--header-bg` / `--header-border` | 上部ヘッダーの背景 / 下線 | `transparent` / `2px solid` |
| `--app-title-font` / `-size` / `-weight` / `-spacing` / `-transform` / `-color` | ダッシュボード名の文字組み | `0.12em` / `uppercase` |
| `--app-title-fill` | ダッシュボード名をグラデーション文字に（`--app-title-color: transparent` と併用） | `linear-gradient(90deg, #f0c, #0cf)` |
| `--widget-bg` / `--widget-border` / `--widget-radius` | カードの背景 / 枠線 / 角丸 | `transparent` / `0` / `22px` |
| `--widget-shadow` / `--widget-shadow-hover` | カードの影 / ホバー時の影 | `5px 5px 0 #111` |
| `--widget-hover-translate` | ホバー時にカードをずらす量 | `-3px -3px` |
| `--widget-backdrop` | カードの背後のぼかし（すりガラス） | `blur(18px) saturate(1.5)` |
| `--widget-header-border` | ウィジェット名の下線 | `2px solid var(--color-text)` |
| `--widget-title-font` / `-size` / `-weight` / `-spacing` / `-transform` / `-color` | ウィジェット名の文字組み | `0.18em` / `uppercase` |
| `--widget-title-prefix` | ウィジェット名の前に付ける文字 | `"> "` |
| `--link-radius` / `--link-hover-bg` / `--link-hover-color` | リンクの角丸 / ホバー時の背景・文字色 | `0` / `var(--color-accent)` |
| `--tile-bg` / `--tile-border` | タイル表示のリンクの背景 / 枠線 | `transparent` / `1px solid` |
| `--button-radius` / `--button-shadow` / `--input-bg` / `--search-radius` | ボタン・入力欄の形 | `0` / `3px 3px 0 #111` |
| `--note-bg` | メモ欄の背景 | |
| `--clock-font` / `--clock-weight` / `--clock-color` / `--clock-glow` | 時計の文字 | `0 0 14px rgb(61 255 139 / 0.55)` |

## 部品ごとに変える

クラス名は「部品\_\_要素--状態」（BEM）で付けています。

```css
@layer custom {
  /* 壁紙を敷いて、カードをすりガラス風に（変数だけで書けます） */
  :root {
    --page-bg: url("../images/wallpaper.jpg") center / cover, var(--color-bg);
    --widget-bg: color-mix(in srgb, var(--color-surface) 70%, transparent);
    --widget-backdrop: blur(12px);
    --header-bg: transparent;
  }

  /* 特定の種類のウィジェットだけ変える */
  .widget--clock .clock__time { color: var(--widget-accent); }

  /* 特定のウィジェットだけ変える（data-id は書き出した JSON で確認できます） */
  .widget[data-id="google"] { background: var(--color-surface-muted); }

  /* カードの上辺をウィジェットの色で塗る */
  .widget { border-top: 3px solid var(--widget-accent); }

  /* 編集モードのときだけ効かせる */
  [data-editing] .widget { outline: 2px dashed var(--widget-accent); }
}
```

| 主なクラス・属性 | 対象 |
|---|---|
| `.app-header`, `.app-header__title` | 上部のヘッダー / ダッシュボード名 |
| `.app-footer`, `.app-footer__link`, `.app-footer__version` | 画面の下に固定したフッター / このテンプレートの GitHub へのリンク（アイコン） / バージョン番号 |
| `.dashboard` | ウィジェットを並べるグリッド |
| `.widget`, `.widget--links` / `--note` / `--clock` / `--search` / `--embed` など | ウィジェット（種類別。アドオンは `.widget--アドオンの type`） |
| `.widget[data-size="s"]`（`m` `l` `xl`） | 幅ごと |
| `.widget[data-rows="1"]`（`2` `3` `4`） | 高さ（段数）ごと |
| `.widget[data-accent]` | ✎ で色を設定したウィジェット（見出しの前に色の丸が付く） |
| `.widget__header`, `.widget__title`, `.widget__title-text`, `.widget__body` | ウィジェットの見出し・本文 |
| `.link-list--list`, `.link-list--grid` | リンクのリスト表示 / タイル表示 |
| `.link`, `.link__icon`, `.link__title`, `.link__desc` | リンク 1 件 |
| `.note`, `.clock__time`, `.clock__date`, `.web-search`, `.embed` | 各ウィジェットの中身 |
| `.embed--video`, `.embed--vertical` | YouTube の埋め込み / そのうちショート動画（縦長） |
| `.photo`, `.photo--cover` / `--contain`, `.photo__img`, `.photo__caption`, `.photo__nav`, `.photo__dot` | 写真ウィジェット（見せ方別）/ 画像 / キャプション / 前後ボタン / 枚数の点 |
| `.markdown`（`.note--view`） | Markdown で表示しているメモ（中の `h1`〜`h6`・`ul`・`code` などを調整できます） |
| `.cal-day`, `.cal-event`, `.cal-event.is-now`, `.cal-event__time`, `.cal-event__title` | カレンダーの日ごとのまとまり / 予定 / 進行中の予定 / 時刻 / 件名 |
| `.mail`, `.mail__count` | Gmail の未読件数 |
| `.weather`, `.weather__temp`, `.weather__day` | 天気 / 今の気温 / 1 日分の予報 |
| `.timer`, `.timer--work` / `--short` / `--long` / `--timer`, `.timer__time`, `.timer__bar-fill` | タイマー（状態別）/ 残り時間 / 進み具合のバー |
| `.wclock__row`, `.wclock__label`, `.wclock__time`, `.wclock__diff` | 世界時計の 1 都市 / 表示名 / 時刻 / 時差 |
| `.habit__table`, `.habit__cell`, `.habit__cell.is-done`, `.is-today` | 習慣トラッカーの表 / 記録の丸 / 記録済み / 今日の列 |
| `.gh-list`, `.gh-item`, `.gh-list__count` | GitHub の一覧 / 1 件 / 件数 |
| `.todo__form`, `.todo-chip`, `.todo-group`, `.todo-group__header`, `.todo-item`, `.todo-item--done`, `.todo-item__check` | ToDo の入力欄・絞り込みボタン・カテゴリー・1 件ごとの行 |
| `.widget.is-drop-target` | URL をドラッグして、ドロップできる状態のリンク集 |
| `.widget__resize`, `.widget.is-resizing`, `.widget__resize-badge` | 編集中の右下の大きさを変える角 / 大きさを変えている最中のウィジェット / そのとき出る「M（2 列）・2 段」の表示 |
| `.widget__refresh` | カレンダー・Gmail の見出しの ↻（連携中だけ表示） |
| `.toast` | 画面下に一時的に出るお知らせ |
| `.tabs`, `.tab`, `.tab[aria-selected="true"]`, `.tabs__add` | タブ列 / タブ 1 つ / 表示中のタブ / タブの追加ボタン |
| `.button`, `.button--primary`, `.input`, `.dialog` | ボタン・入力欄・ダイアログ |
| `html[data-mode="light"]`（`dark`） | 配色を固定しているとき（自動のときは付かない） |
| `html[data-preset="..."]` | テーマを選んでいるとき（標準のときは付かない） |
| `html[data-density="compact"]` | 表示密度「コンパクト」のとき |
| `html[data-layout="flow"]` | ウィジェットの高さを「中身に合わせる」にしているとき（タイル表示のときは付かない） |
| `html[data-editing]` | 編集モード中 |
| `html[lang="ja"]`（`en` など） | 表示している言語 |
| `#mode-toggle` | 右上のライト / ダークの切り替えボタン |

## テーマを増やす

設定画面の「テーマ」に選択肢を足すこともできます。

1. `public/css/themes.css` にブロックを追加します。**変数の上書きだけで書く**のがルールです。
   こうすると、設定画面の見本も自動でそのテーマの見た目になります
   （見本の要素にも `data-preset` が付いていて、中では同じ変数が使われるため）。
   セレクターは `:root[...]` ではなく `[data-preset="..."]` と書いてください。

   ```css
   @layer themes {
     [data-preset="sakura"] {
       --color-bg:     light-dark(#fdf3f5, #1c1416);
       --color-accent: light-dark(#c2185b, #f48fb1);
       --page-bg: linear-gradient(160deg, light-dark(#ffe4ec, #2a1520), var(--color-bg) 60%);
       --widget-radius: 24px;
       --widget-title-prefix: "🌸 ";
     }
   }
   ```

2. `public/js/config.js` の `THEME_PRESETS` に `{ id: "sakura", label: "桜" }` を追加します。
   `label` には表示する文字か、`public/js/locales/` の文言のキー（言語ごとに訳したいとき）を書きます。

常にダークで表示したいテーマは、ブロックの中に `color-scheme: dark;` を書きます（「ターミナル」がこの例です）。

## 初期レイアウトを変える

ログインして**初めて**開いたときのレイアウトは `public/default-dashboard.json` です。
リポジトリを Public にしている場合は、**人に見られて困るリンクは書かないでください**
（自分のリンクは画面から追加すれば Firestore に保存され、公開されません）。
