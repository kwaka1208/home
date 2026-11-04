# ウィジェットの仕組みと、自作ウィジェットの作り方

personal-dashboard のウィジェットがどう動いているかと、自分でウィジェットを追加する手順をまとめています。
使い方は [USAGE.md](USAGE.md)、見た目の変え方は [DESIGN.md](DESIGN.md)、セットアップは [README.md](README.md) を見てください。

ビルドの仕組みはありません。`public/` の HTML・CSS・JavaScript を書き換えて、ブラウザで再読み込みすればすぐに試せます
（ローカルで動かす方法は README の「ローカルで動かす」）。

---

## 全体の流れ

```
保存データ（JSON）
  │  読み込み：normalize() → normalizeWidget()      … 足りない値を補い、おかしな値を直す
  ▼
state（画面の状態。1 つの JSON）
  │  描画：render() → renderWidget() → renderWidgetBody()   … 種類ごとの描画関数を呼ぶ
  ▼
画面
  │  操作：ボタンなどで state を書き換えて commit()
  ▼
保存：scheduleSave() → 0.8 秒後に storage.save()     … Firestore（とブラウザの控え）へ
```

- 画面の状態はすべて `state` という 1 つのオブジェクトにあり、それを丸ごと JSON にして保存します。
- 画面の部品を少しずつ書き換えるのではなく、**state を変えたら全体を描き直す**のが基本です（`commit()`）。
- ウィジェットの外枠（見出し・✎ ボタン・並べ替えのつまみ・大きさを変える角）は共通の `renderWidget()` が作ります。
  **自作するのは、その中身（本文）と、編集画面の設定欄だけ**です。

### 関係するファイル

| ファイル | 役割 |
|---|---|
| `public/js/app.js` | 画面のほとんど。ウィジェットの種類の一覧・描画・編集画面の処理 |
| `public/index.html` | 編集画面（ダイアログ）の「種類」の選択肢と、種類ごとの設定欄 |
| `public/css/components.css` | ウィジェットごとの見た目 |
| `public/css/custom.css` | 自分用の上書き。本家は空のまま保つので、自作ウィジェットの CSS はここに書くのがおすすめ |
| `public/js/services.js` | 外部のサービス（天気・GitHub）から読み込む関数 |
| `public/js/storage.js` | ログインと保存（ふつうは触らなくてよい） |

---

## ウィジェットのデータ

ウィジェット 1 つは、次のような JSON です。タブ（`pages[].widgets`）の中に並び、並び順がそのまま画面の順番になります。

```json
{
  "id": "a1b2c3d4",
  "type": "countdown",
  "title": "締め切りまで",
  "size": "s",
  "rows": 1,
  "accent": "#2f6f5e",
  "date": "2026-12-31",
  "label": "年末"
}
```

| 項目 | 意味 | 誰が扱うか |
|---|---|---|
| `id` | ウィジェットを見分ける文字列 | 共通（自動） |
| `type` | 種類（`links`・`note`・`weather` など） | 共通 |
| `title` | 見出し（空なら見出しなし） | 共通 |
| `size` | 幅 `s` / `m` / `l` / `xl` | 共通 |
| `rows` | 高さ（段数）1〜4 | 共通 |
| `accent` | アクセントカラー（任意） | 共通 |
| それ以外（上の例では `date`・`label`） | 種類ごとの設定や中身 | **自作する部分** |

- 種類ごとの項目は、自由に名前を付けて足せます。共通の項目と同じ名前は使わないでください。
- 保存されるのはこの JSON だけです。ダッシュボード全体で **500KB まで**（Firestore のルール）なので、大きなデータや画像そのものは入れないでください。
- **パスワードや API キーなどの秘密は入れないでください。** 必要なときは、GitHub ウィジェットのトークンのように、その端末の `localStorage` に保存します（後述）。

---

## 自作ウィジェットを追加する手順

例として、指定した日付までの残り日数を表示する **カウントダウン**（`countdown`）を作ります。
`public/js/app.js` と `public/index.html` の決まった場所に、少しずつ書き足していきます。

### 1. 種類の一覧に加える（app.js）

`WIDGET_TYPES` に、種類の名前（`type` の値）と表示名を足します。
**ここに載っていない種類のウィジェットは、読み込むときに捨てられます。**

```js
const WIDGET_TYPES = {
  links: "リンク集",
  // …
  github: "GitHub",
  countdown: "カウントダウン", // ← 追加
};
```

### 2. 大きさの決まりを決める（app.js・任意）

| 定数 | 意味 | 書かなかったとき |
|---|---|---|
| `DEFAULT_ROWS` | 新しく追加したときの高さ（段数） | 2 段 |
| `MIN_SIZE` | これより小さくできない幅・高さ。例：`{ size: "m", rows: 2 }` | 幅 S・1 段 |
| `FIXED_ROWS` | 高さを固定する（編集画面でもドラッグでも変えられない） | 固定しない |

```js
const DEFAULT_ROWS = {
  // …
  countdown: 1, // ← 追加
};
```

1 段（タイル 1 つ分）の高さは約 150px で、見出しを除くと中身に使えるのは約 85px です（コンパクト表示ではもう少し狭くなります）。

### 3. 編集画面の選択肢と設定欄を加える（index.html）

ウィジェット編集ダイアログ（`<dialog id="widget-dialog">`）の「種類」の `<select name="type">` に、選択肢を足します。

```html
<option value="countdown">カウントダウン</option>
```

同じフォームの中（ほかの種類の設定欄が並んでいるあたり）に、設定欄を足します。
`data-for-type="countdown"` を付けた要素は、種類が `countdown` のときだけ表示されます。
`name` は、ほかの欄と重ならない名前にしてください（`f.countdownDate` のように JavaScript から読みます）。

```html
<!-- カウントダウン -->
<label class="field" data-for-type="countdown">
  <span class="field__label">日付</span>
  <input class="input" type="date" name="countdownDate">
</label>
<label class="field" data-for-type="countdown">
  <span class="field__label">何の日か（任意。例：年末、締め切り）</span>
  <input class="input" name="countdownLabel">
</label>
```

入力欄で Enter を押すと保存されます（複数行の `<textarea>` では改行）。この動きは自動で付きます。

### 4. 設定の読み書きを書く（app.js の `WIDGET_FORMS`）

`WIDGET_FORMS` に、種類ごとに 4 つの関数を書きます。どれも省略できます。

| 関数 | 呼ばれるとき | すること |
|---|---|---|
| `init(w)` | 新しく追加して保存するとき（`save` の前） | 中身の初期値を入れる |
| `normalize(w)` | 保存データを読み込むたび | 足りない値を補い、おかしな値を直す。**古いデータや手で書き換えたデータも来る前提で** |
| `fill(f, w)` | 編集画面を開いたとき | 設定欄に今の値を入れる。新しく追加するときは `w` が `null` |
| `save(f, w)` | 編集画面で保存したとき | 設定欄の値を `w` に書き込む |

`f` はフォームの部品（`form.elements`）で、`f.countdownDate.value` のように `name` で取り出せます。
見出し・幅・高さ・色・タブの移動は共通の処理が扱うので、ここでは書きません。

```js
const WIDGET_FORMS = {
  // …
  countdown: {
    init: (w) => { w.date = ""; w.label = ""; },
    normalize: (w) => {
      w.date = /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : "";
      w.label = typeof w.label === "string" ? w.label : "";
    },
    fill: (f, w) => {
      f.countdownDate.value = w?.date || "";
      f.countdownLabel.value = w?.label || "";
    },
    save: (f, w) => {
      w.date = f.countdownDate.value;
      w.label = f.countdownLabel.value.trim();
      WIDGET_FORMS.countdown.normalize(w);
    },
  },
};
```

### 5. 中身を描く（app.js）

`renderWidgetBody()` の `switch` に 1 行足し、描画関数を書きます。
描画関数は、ウィジェットの本文に入れる **DOM 要素を 1 つ返す**関数です（何も出さないなら `null`）。

```js
function renderWidgetBody(widget) {
  switch (widget.type) {
    // …
    case "countdown": return renderCountdown(widget); // ← 追加
    default: return null;
  }
}

function renderCountdown(widget) {
  if (!widget.date) {
    return h("p", { class: "widget__empty" }, "「編集」→ ✎ で日付を設定してください");
  }
  const [y, m, d] = widget.date.split("-").map(Number);
  const today = new Date();
  const days = Math.round(
    (new Date(y, m - 1, d) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000,
  );
  const text = days > 0 ? `あと ${days} 日` : days === 0 ? "今日です" : `${-days} 日前`;
  return h("div", { class: "countdown" },
    h("span", { class: "countdown__days" }, text),
    h("span", { class: "countdown__label" }, widget.label || widget.date),
  );
}
```

要素は `h(タグ名, 属性, ...子要素)` で作ります（`app.js` の先頭近くにあります）。

```js
h("a", { class: "link", href: url, target: "_blank", rel: "noopener noreferrer" }, "表示する文字")
h("button", { type: "button", onclick: () => { /* 押したとき */ } }, "ボタン")
h("div", { dataset: { id: "x" }, style: { color: "red" } }, child1, child2)
```

文字列の子要素は**文字として**入るので、`<script>` などを書かれても実行されません。
`innerHTML` に外から来た文字列を入れるのはやめてください（Markdown のように HTML にしたいときは、メモウィジェットのように DOMPurify を通します）。

### 6. 見た目を付ける（CSS）

ウィジェットの外枠には `widget--種類名` のクラスが付きます（例：`.widget--countdown`）。
本家の更新と衝突しないよう、自作ウィジェットの CSS は `public/css/custom.css` の `@layer custom { … }` の中に書くのがおすすめです。
色や余白は、テーマに合わせて変わるよう CSS 変数（[DESIGN.md](DESIGN.md) の「主な CSS 変数」）を使ってください。

```css
@layer custom {
  .countdown { display: grid; gap: var(--space-1); }
  .countdown__days {
    font-size: var(--font-size-clock);
    font-weight: var(--clock-weight);
    color: var(--widget-accent); /* ウィジェットのアクセントカラー */
  }
  .countdown__label { color: var(--color-text-muted); font-size: var(--font-size-sm); }
}
```

### 7. 試す

1. ブラウザで再読み込みし、**編集** → **＋ ウィジェットを追加** → 種類に「カウントダウン」を選びます。
2. 日付を入れて保存し、表示を確かめます。✎ で開き直して、値が入っているかも確かめます。
3. 再読み込みしても残っているか（保存されているか）を確かめます。
4. ⚙ のテーマや「コンパクト」、スマートフォンの幅でも崩れないか見ておくと安心です。

ブラウザの開発者ツールの Console に赤いエラーが出ていないかも確認してください。

---

## よく使う部品と決まりごと

### ウィジェットの中で値を変えたとき

ボタンを押して中身を変えるときは、`widget` の値を書き換えてから `commit()` を呼びます。
画面が描き直され、少し後に自動で保存されます（ToDo のチェックや習慣トラッカーと同じ）。

```js
h("button", { type: "button", onclick: () => { widget.count = (widget.count || 0) + 1; commit(); } }, "＋1")
```

| 関数 | すること |
|---|---|
| `commit()` | 描き直して保存する（ふつうはこれ） |
| `commit({ rerender: false })` | 描き直さずに保存だけする（入力中の欄を描き直したくないとき。メモウィジェットが使っています） |
| `refreshWidgetBody(widget)` | そのウィジェットの本文だけを描き直す（保存はしない） |
| `showToast("メッセージ")` | 画面の下に短いお知らせを出す |

### 一定時間ごとに表示を変えたい

- **1 秒ごと**：時計と同じ仕組みに乗せます。`updateClocks()` の中から、自分の更新関数を呼んでください
  （世界時計の `updateWorldClocks(now)` が例です）。描き直しのたびに、画面の要素を探して文字だけ書き換えます。
- **それ以外の間隔**：`setInterval` の戻り値を `widgetTimers.push(…)` に入れてください。
  描き直しのときに自動で止まります（写真のスライドショーが例です）。入れ忘れると、描き直すたびにタイマーが増えていきます。

### 外部のサービスから読み込みたい

天気・GitHub と同じく `renderRemote()` を使うと、読み込み中の表示・エラー表示・更新ボタン・一定時間ごとの読み込み直しが付きます。

```js
function renderMyService(widget) {
  return renderRemote(widget, {
    cacheKey: widget.query,          // これが変わったら読み込み直す
    refreshMs: 15 * 60 * 1000,       // 読み込み直す間隔
    load: () => fetchMyService(widget.query), // Promise を返す関数（services.js に置くとよい）
    view: (data) => h("p", {}, data.text),     // 読み込んだデータを表示する
  });
}
```

さらに、`REMOTE_WIDGETS` に種類名を足すと、1 分ごとに「古くなっていないか」を見直します。

- ブラウザから直接呼ぶので、そのサービスが **CORS** に対応している（ブラウザからの呼び出しを許している）必要があります。
- **API キーをリポジトリに書かないでください。** リポジトリを Public にしていると誰でも見られます。
  個人用のキーが必要なら、GitHub ウィジェット（`getGitHubToken` / `setGitHubToken`）のように、その端末の `localStorage` に保存し、ログアウトで消すようにします。
- 読み込んだデータは表示に使うだけにして、保存データには入れないのが基本です。

### URL を扱うとき

利用者が入力した URL をリンクや画像に使うときは、`safeUrl(url)` を通してください。`javascript:` などの危ない URL を弾きます。
リンクを開くときは、⚙ の「リンクを新しいタブで開く」に合わせて `state.settings.openInNewTab ? "_blank" : "_self"` を使います。

### そのほか

| 名前 | 内容 |
|---|---|
| `$(セレクター, 親)` / `$$(セレクター, 親)` | 要素を 1 つ / すべて探す（`querySelector` の短縮形） |
| `uid()` | 新しい id を作る |
| `editing` | 編集モード中なら `true` |
| `state.settings` | 設定（テーマ・密度・リンクを新しいタブで開くか など） |
| `widgets()` / `page()` | 今のタブのウィジェット一覧 / 今のタブ |
| `.widget__empty` | 「まだ設定されていません」などの説明文に使う共通のクラス |

---

## 本家の更新を取り込むときの注意

自作ウィジェットのために `app.js` や `index.html` を書き換えると、本家の更新を取り込むとき（README の「本家の更新を取り込む」）に、同じ場所が変わっていると**衝突（コンフリクト）**することがあります。
衝突を少なくするコツです。

- 描画関数・CSS など、新しく書くまとまった部分は、ファイルの**末尾**か `custom.css` に置く。
- 既存の一覧（`WIDGET_TYPES`・`switch`・`<select>` など）に足すのは、それぞれ 1 行だけにする。
- 自分で足した場所に `// 自作：countdown` のような目印のコメントを付けておく。衝突したときに見つけやすくなります。

衝突したときは、本家の変更と自分の追加の**両方を残す**ように直せば大丈夫です。

みんなに使ってもらえそうなウィジェットができたら、本家の [Issues](https://github.com/kwaka1208/personal-dashboard/issues) で教えてください。
