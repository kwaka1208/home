# personal-dashboard

よく使うツールへのリンクやメモをまとめた、**自分専用のダッシュボード**です。
Google アカウントでログインした本人だけが、中身を見たり編集したりできます。

- 画面のレイアウトはドラッグ＆ドロップで自由に並べ替え
- リンク集・ToDo（カテゴリー別）・メモ・時計・Web 検索・埋め込み（Google カレンダーなど）の 6 種類のウィジェット
- ブラウザのアドレスバーから URL をドラッグ＆ドロップするだけでリンクを追加
- 編集内容は Firebase（Cloud Firestore）に自動保存されるので、PC でもスマホでも同じ画面
- 見た目はテーマで切り替え、CSS 変数（デザイントークン）で丸ごと着せ替えも可能
- このリポジトリは**テンプレート**です。コピーして自分のリポジトリを作れば、誰でも自分用のダッシュボードを無料で持てます

## しくみ

```
ブラウザ ──▶ GitHub Pages（画面：HTML / CSS / JavaScript）
   │
   ├──▶ Firebase Authentication（Google でログイン）
   └──▶ Cloud Firestore（ダッシュボードのデータ。本人だけ読み書きできる）
```

| 役割 | 使うもの | 費用 |
|---|---|---|
| ソースコードの管理と画面の公開 | GitHub ＋ GitHub Pages | 無料 |
| ログイン（Google 認証） | Firebase Authentication | 無料 |
| データの保存 | Cloud Firestore | 無料プラン（Spark）で足ります。カードの登録も不要 |

Firebase は**各自が自分のプロジェクトを作って**使います。あなたのデータはあなたの Firebase に保存され、
テンプレートの作者や他の利用者が見ることはできません。

### 何が公開されて、何が守られるか

| 誰でも見られるもの | ログインした本人しか見られないもの |
|---|---|
| ログイン画面と、画面のプログラム（このリポジトリと同じ内容） | 登録したリンク、メモ、ウィジェットの並び |
| `firebase-config.js` に書く Firebase の設定値 | ダッシュボードの名前、テーマ、埋め込みの URL |

データを守っているのは、Firestore の**セキュリティルール**（`firestore.rules`）です。
「ログインしていて、許可したメールアドレスで、自分のデータであること」を満たすときだけ読み書きできます。
他の人が Google アカウントでログインすること自体はできますが、データは一切読めません。

Firebase の設定値（`apiKey` など）は、画面のプログラムに埋め込んで公開する前提の値で、秘密情報ではありません。

---

## 自分用のダッシュボードを作る手順

所要時間は 15〜20 分ほどです。用意するのは GitHub アカウントと Google アカウントの 2 つです。

> Firebase と GitHub の管理画面は、ときどきメニュー名が変わります。見当たらないときは、
> 各手順に付けた公式ドキュメントのリンクを確認してください。

### 1. テンプレートから自分のリポジトリを作る

1. このリポジトリの右上にある **Use this template → Create a new repository** を押します。
2. Owner に自分のアカウント、Repository name に好きな名前（例：`personal-dashboard`）を入れます。
3. 公開範囲は **Public** を選びます。
   GitHub の無料プランでは、GitHub Pages は Public リポジトリからしか公開できません。
   リンクやメモはリポジトリに入らないので、Public でも中身は公開されません。
4. **Create repository** を押します。

作った直後に Actions の「Deploy to GitHub Pages」が失敗することがありますが、
次の手順 2 の設定前に動いたためなので気にしなくて大丈夫です。

### 2. GitHub Pages を有効にする

参考：[GitHub Docs - GitHub Pages サイトの公開元を設定する](https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

1. 作ったリポジトリの **Settings → Pages** を開きます。
2. **Build and deployment** の **Source** を **GitHub Actions** にします。

これで、`main` ブランチに変更を push するたびに、`public/` フォルダの中身が自動で公開されます。
公開先の URL は `https://<GitHub のユーザー名>.github.io/<リポジトリ名>/` です。

### 3. Firebase プロジェクトを作り、Google ログインを有効にする

参考：[Firebase - Google ログイン](https://firebase.google.com/docs/auth/web/google-signin?hl=ja)

1. [Firebase コンソール](https://console.firebase.google.com/) を開き、**プロジェクトを作成**します。
   名前は何でも構いません。Google アナリティクスや Gemini は使わないので、オフで大丈夫です。
2. 左メニューの **構築 → Authentication** を開き、**始める** を押します。
3. **ログイン方法** タブで **Google** を選び、**有効にする** をオンにします。
   プロジェクトのサポートメールに自分のアドレスを選んで **保存** します。

Google Cloud で OAuth クライアントを作る必要はありません（Firebase が自動で用意します）。

### 4. Firestore を作り、セキュリティルールを設定する

参考：[Firebase - Cloud Firestore を使ってみる](https://firebase.google.com/docs/firestore/quickstart?hl=ja)

1. 左メニューの **構築 → Firestore Database** を開き、**データベースの作成** を押します。
2. エディションを聞かれたら **Standard**、ロケーションは **asia-northeast1（東京）** などの近い場所を選びます
   （ロケーションは後から変更できません）。
3. セキュリティルールは **本番環境モード** を選んで作成します。
4. 作成できたら **ルール** タブを開き、このリポジトリの [`firestore.rules`](firestore.rules) の内容を**すべて**貼り付けます。
5. 貼り付けた中の次の部分を、**ログインに使う自分の Google アカウントのメールアドレス（小文字）**に書き換えます。

   ```
   function allowedEmails() {
     return ['you@example.com'];
   }
   ```

   家族などにも使わせる場合は `['a@gmail.com', 'b@gmail.com']` のように並べます。データは人ごとに別々に保存されます。
6. **公開** を押します。

> リポジトリの `firestore.rules` は手順の見本です。書き換えなくても動作には影響しません
> （Firebase に効くのは、コンソールで公開したルールです）。

### 5. Firebase の設定値をリポジトリに書く

1. Firebase コンソールの左上の歯車 → **プロジェクトの設定** を開きます。
2. **全般** タブの下の方にある **マイアプリ** で、ウェブのアイコン（`</>`）を押します。
3. アプリのニックネームを入れて **アプリを登録** します（Firebase Hosting のチェックは不要です）。
4. 表示される `firebaseConfig` の値を控えます。

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     ...
   };
   ```

5. GitHub で自分のリポジトリの `public/js/firebase-config.js` を開き、鉛筆アイコン（Edit this file）を押します。
6. `YOUR_...` となっている 6 つの値**だけ**を、控えた値に書き換えて **Commit changes** を押します。

> **ファイル全体を Firebase コンソールの見本で置き換えないでください。** 見本の
> `const firebaseConfig = {` や `import { initializeApp } ...` をそのまま貼ると、画面が真っ白になります。
> 書き換えた後は、次の形になっていれば正解です（`"..."` の部分があなたの値）。
>
> ```js
> export const firebaseConfig = {
>   apiKey: "...",
>   authDomain: "...",
>   projectId: "...",
>   storageBucket: "...",
>   messagingSenderId: "...",
>   appId: "...",
> };
>
> export const FIREBASE_SDK_VERSION = "13.1.0";
>
> export const USE_EMULATORS_ON_LOCALHOST = false;
> ```
>
> - 1 行目は `export const firebaseConfig = {` です（`export` が必要で、`const firebaseConfig` を二重にしない）
> - 下の `FIREBASE_SDK_VERSION` と `USE_EMULATORS_ON_LOCALHOST` の 2 行も消さずに残します

コミットすると、手順 2 で設定した GitHub Actions が自動で動き、1〜2 分で公開されます
（リポジトリの **Actions** タブで進み具合を確認できます）。

### 6. GitHub Pages のドメインを Firebase に登録する

1. Firebase コンソールの **Authentication → 設定 → 承認済みドメイン** を開きます。
2. **ドメインを追加** で `<GitHub のユーザー名>.github.io` を追加します（`https://` やリポジトリ名は付けません）。

これをしないと、ログインのときに「承認済みドメインに登録されていません」と表示されます。

### 7. 使い始める

`https://<GitHub のユーザー名>.github.io/<リポジトリ名>/` を開き、**Google でログイン** を押します。
手順 4 で許可したアカウントでログインすると、サンプルのレイアウトが表示されます。
右下に自分のメールアドレスが出ていれば完了です。

ブラウザのホームページやブックマークに登録しておくと便利です。

### 8. API キーの使える場所を絞る（おすすめ）

`apiKey` は公開されても問題ない値ですが、他のサイトや他の用途に使われないように制限をかけておくと安心です。
手順 5 でコミットすると GitHub から「Publicly leaked secret」という警告が届きますが（下の
「GitHub から『Publicly leaked secret』の警告が届いたとき」を参照）、この制限をかけておけば心配いりません。

1. [Google Cloud コンソールの認証情報](https://console.cloud.google.com/apis/credentials) を開き、上部で Firebase のプロジェクトを選びます。
2. **API キー** の一覧から、Firebase が作ったキー（通常は「Browser key (auto created by Firebase)」）を開きます。
3. **アプリケーションの制限** を **ウェブサイト** にし、次を追加します。
   - `https://<GitHub のユーザー名>.github.io/*`
   - `https://<プロジェクト ID>.firebaseapp.com/*`（ログイン画面で使われます）
   - 手元で試す場合は `http://localhost/*` と `http://127.0.0.1/*` も
4. **API の制限** を **キーを制限** にし、次の 3 つを選びます。
   - Identity Toolkit API（ログイン）
   - Token Service API（ログイン状態の維持）
   - Cloud Firestore API（データの保存）
5. 保存して数分待ってから、ダッシュボードでログインと保存ができるか確認します。
   うまくいかなくなったら、いったん制限を外して、許可したサイトや API に漏れがないか見直してください。

---

## 使い方

| 操作 | 方法 |
|---|---|
| 編集を始める／終える | 右上の **編集** ボタン（編集中は **完了**） |
| ウィジェットを並べ替える | 編集中に、見出し左の **⠿** をドラッグ |
| リンクを並べ替える・別のウィジェットへ移す | 編集中に、リンクをドラッグ |
| ウィジェットを追加 | 編集中に、末尾の **＋ ウィジェットを追加** |
| ウィジェットの名前・幅・色を変える | 編集中に、見出し右の **✎** |
| リンクを追加（ドラッグ＆ドロップ） | ブラウザの**アドレスバー**の URL（または他のページのリンク）を、リンク集ウィジェットの上にドラッグして離す。編集中でなくても使えます |
| リンクを追加（入力して） | 編集中に、リンク集の見出し右の **＋** |
| リンクを編集・削除 | 編集中に、リンクをクリック（または **✎**） |
| リンクを絞り込む | 上部の検索欄（`/` キーで移動、Enter で先頭のリンクを開く） |
| テーマ・配色・表示密度・バックアップ | 右上の **⚙** |
| ログアウト | 右下の **ログアウト**（この端末に残した控えも消えます） |

スマートフォンでは、少し長押ししてからドラッグすると並べ替えられます。

### ウィジェットの種類

| 種類 | できること |
|---|---|
| リンク集 | リンクを「リスト」または「タイル」で表示。アイコンは絵文字・画像 URL・サイトのファビコンから選べます |
| ToDo | カテゴリー（仕事・プライベートなど）ごとに ToDo を管理。下の「ToDo の使い方」を参照 |
| メモ | 自由に書けるメモ欄。入力すると自動保存 |
| 時計 | 現在時刻と日付。タイムゾーン（例：`America/New_York`）も指定可能 |
| Web 検索 | 検索 URL を変えれば Google 以外（社内 Wiki、GitHub 検索など）にも使えます |
| 埋め込み | Google カレンダーの埋め込み URL など、iframe で表示できるページ |

幅は S（1 列）・M（2 列）・L（3 列）・XL（全幅）から選べます。
画面が狭くなると、自動で 2 列 → 1 列に詰まります。

> アイコン未設定のリンクは、Google のファビコン取得サービスからアイコンを読み込みます
> （リンク先のドメイン名が Google に送られます）。気になる場合は ⚙ でオフにできます。

### リンクをドラッグ＆ドロップで追加する

1. 追加したいページをブラウザの別のタブやウィンドウで開きます。
2. アドレスバーの URL（Chrome や Edge は左端の鍵などのアイコン、Safari や Firefox は URL の文字）を
   ダッシュボードのタブまでドラッグし、リンク集ウィジェットの上で離します。
   ドロップできるウィジェットは点線で囲まれます。
3. 画面下に「〇〇を追加しました」と出たら完了です。**名前を編集** を押すと、表示名やアイコンを変えられます。

ページ名が取れない場合はドメイン名で登録されます。同じ URL がすでにあるウィジェットには追加されません。
ウィンドウを左右に並べておくと、ドラッグしやすくなります。

### ToDo の使い方

ToDo ウィジェット（編集中の **＋ ウィジェットを追加** で種類に「ToDo」を選ぶ）は、
1 つのウィジェットの中でカテゴリーごとに ToDo を分けて管理できます。
最初は「仕事」「プライベート」の 2 つのカテゴリーがあります。

| 操作 | 方法 |
|---|---|
| ToDo を追加 | 入力欄に内容を書き、右のプルダウンでカテゴリーを選んで **追加**（Enter でも可） |
| 完了にする | チェックボックスをクリック。完了したものは取り消し線になります |
| 削除する | 行にマウスを乗せると出る **×** |
| カテゴリーで絞り込む | 上の「すべて / 仕事 / プライベート」のボタン（数字は未完了の件数） |
| 完了したものをまとめて削除 | 下の **完了した n 件を削除**（絞り込み中は、そのカテゴリーの分だけ） |
| カテゴリーを追加 | 編集中に、ウィジェットの見出し右の **＋** |
| カテゴリーの名前を変える・削除 | 編集中に、カテゴリー名の右の **✎** / **×**（削除すると中の ToDo も消えます） |
| ToDo の内容を書き直す | 編集中に、ToDo の文字をクリック |
| 並べ替え・別のカテゴリーへ移す | 編集中に、ToDo をドラッグ |
| カテゴリーの並べ替え | 編集中に、カテゴリー名の左の **⠿** をドラッグ |

### テーマ

⚙ の設定画面に各テーマの見本が並んでいて、クリックするとその場で画面全体が切り替わります
（「保存」を押すと確定、「キャンセル」で元に戻ります）。

| テーマ | 雰囲気 |
|---|---|
| 標準 | 生成りの背景に白いカード。落ち着いた緑のアクセント |
| グラス | にじんだ色の背景に、すりガラスのような半透明カード |
| ブルータル | 太い黒線とずらした影、黄色のアクセント。大文字の見出し |
| ターミナル | 黒地に蛍光グリーンの等幅文字。時計が光る（常にダーク） |
| ミッドナイト | 濃紺と金。字間を広げた上品な見出し（ライトでは生成りと金） |
| エディトリアル | 雑誌のように箱をなくし、太い罫線と余白で区切る。明朝体の見出し |
| 藍 / 和紙 / モノクロ | 標準の形のまま、色合いだけを変えたもの |

どのテーマも、配色（OS に合わせる / ライト / ダーク）と表示密度（標準 / コンパクト）を組み合わせられます。
フォントは各 OS に最初から入っているものだけを使います（明朝体の見出しも、ヒラギノ明朝・游明朝などの OS 標準フォントです）。

### バックアップ

⚙ → **書き出す（JSON）** で、ダッシュボード全体を JSON ファイルとして保存できます。
**読み込む** で復元できます。別の人のレイアウトを取り込むこともできます。

---

## 見た目をカスタマイズする

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

### いちばん簡単な方法：custom.css で変数を上書きする

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

### 主な CSS 変数

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
| `--grid-columns` / `--grid-gap` | 広い画面での列数 / ウィジェットの間隔 |
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

### 部品ごとに変える

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
| `.dashboard` | ウィジェットを並べるグリッド |
| `.widget`, `.widget--links` / `--note` / `--clock` / `--search` / `--embed` | ウィジェット（種類別） |
| `.widget[data-size="s"]`（`m` `l` `xl`） | 幅ごと |
| `.widget[data-accent]` | ✎ で色を設定したウィジェット（見出しの前に色の丸が付く） |
| `.widget__header`, `.widget__title`, `.widget__title-text`, `.widget__body` | ウィジェットの見出し・本文 |
| `.link-list--list`, `.link-list--grid` | リンクのリスト表示 / タイル表示 |
| `.link`, `.link__icon`, `.link__title`, `.link__desc` | リンク 1 件 |
| `.note`, `.clock__time`, `.clock__date`, `.web-search`, `.embed` | 各ウィジェットの中身 |
| `.todo__form`, `.todo-chip`, `.todo-group`, `.todo-group__header`, `.todo-item`, `.todo-item--done`, `.todo-item__check` | ToDo の入力欄・絞り込みボタン・カテゴリー・1 件ごとの行 |
| `.widget.is-drop-target` | URL をドラッグして、ドロップできる状態のリンク集 |
| `.toast` | 画面下に一時的に出るお知らせ |
| `.button`, `.button--primary`, `.input`, `.dialog` | ボタン・入力欄・ダイアログ |
| `html[data-mode="light"]`（`dark`） | 配色を固定しているとき（自動のときは付かない） |
| `html[data-preset="..."]` | テーマを選んでいるとき（標準のときは付かない） |
| `html[data-density="compact"]` | 表示密度「コンパクト」のとき |
| `html[data-editing]` | 編集モード中 |

### テーマを増やす

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

常にダークで表示したいテーマは、ブロックの中に `color-scheme: dark;` を書きます（「ターミナル」がこの例です）。

### 初期レイアウトを変える

ログインして**初めて**開いたときのレイアウトは `public/default-dashboard.json` です。
リポジトリを Public にしている場合は、**人に見られて困るリンクは書かないでください**
（自分のリンクは画面から追加すれば Firestore に保存され、公開されません）。

---

## 本家の更新を取り込む

テンプレートから作ったリポジトリは本家と履歴がつながっていないため、フォークのような
「Sync fork」ボタンはありません。更新を取り込みたいときは、手元に clone したリポジトリで次を実行します。

最初の 1 回だけ、本家を `upstream` という名前で登録します。

```bash
git remote add upstream https://github.com/kwaka1208/personal-dashboard.git
```

本家の最新を取ってきます。

```bash
git fetch upstream
```

本家の `main` を取り込みます。

```bash
git merge upstream/main --allow-unrelated-histories
```

2 回目以降は `--allow-unrelated-histories` は不要です（`git fetch upstream` と `git merge upstream/main` だけ）。

最初の取り込みでは、あなたが変更したファイル（`firebase-config.js` など）で衝突（コンフリクト）が出ることがあります。
`firebase-config.js` は自分の値を残してください。衝突したファイルを直したら `git add` してから `git commit` し、
GitHub に push すると自動で公開し直されます。Firestore のデータはそのまま残ります。

本家で `firestore.rules` が変わったときは、Firebase コンソールのルールにも反映してください
（自分のメールアドレスの部分は残します）。

カスタマイズを `custom.css` と `themes.css` への追記に留めておくと、衝突しにくくなります。

---

## ローカルで動かす（開発する人向け）

ビルドは不要です。`public/` フォルダを HTTP で配信するだけで動きます。

```bash
cd public
```

```bash
python3 -m http.server 8000
```

<http://localhost:8000> を開きます。

- `firebase-config.js` が未設定（`YOUR_...` のまま）なら「ローカルモード」で動き、データはブラウザにだけ保存されます。
  見た目の調整はこれで十分です。
- 自分の Firebase の値を入れていれば、本番と同じ Firebase につながります（`localhost` は最初から承認済みドメインです）。

### Firebase エミュレーターで試す

本番のデータに触れずにログインや保存を試したいときは、[Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite?hl=ja) を使います（Node.js と Java が必要です）。

1. `public/js/firebase-config.js` を一時的に次のようにします（コミットしないでください）。
   - `projectId` を `demo-test`、`apiKey` を `fake-api-key` にする
   - `USE_EMULATORS_ON_LOCALHOST` を `true` にする
2. `firestore.rules` の `allowedEmails()` に、テストで使うメールアドレスを書きます。
3. リポジトリのルートでエミュレーターを起動します。

   ```bash
   npx firebase-tools emulators:start --only auth,firestore --project demo-test
   ```

4. 別のターミナルで `public/` を配信し、<http://127.0.0.1:8000> を開きます。
   ログインボタンを押すと、エミュレーターの画面で好きなメールアドレスのテスト用アカウントを作れます。

### ファイル構成

```
public/                      GitHub Pages で公開されるファイル
  index.html                 画面の骨組み
  default-dashboard.json     初回表示のレイアウト
  css/                       スタイル（上記「見た目をカスタマイズする」参照）
  js/app.js                  画面の描画・編集・ドラッグ＆ドロップ
  js/storage.js              ログインと保存（Firebase）
  js/firebase-config.js      あなたの Firebase の設定値
  js/config.js               テーマ一覧などの設定
  vendor/Sortable.min.js     並べ替えライブラリ SortableJS（MIT）
firestore.rules              Firestore のセキュリティルール（コンソールに貼り付ける見本）
firebase.json                エミュレーター用の設定
.github/workflows/pages.yml  public/ を GitHub Pages に公開する設定
```

### データの保存形式

Firestore の `dashboards/{ユーザー ID}` ドキュメントに、次の形で保存します。

| フィールド | 内容 |
|---|---|
| `json` | ダッシュボード全体を JSON 文字列にしたもの（設定画面の「書き出す」と同じ形式。500KB まで） |
| `updatedAt` | 最後に保存した日時（サーバーの時刻） |

---

## 困ったとき

| 症状 | 確認すること |
|---|---|
| 「Firebase が未設定のため『ローカルモード』で動いています」 | 手順 5 で `firebase-config.js` の値を書き換えてコミットしたか。公開まで 1〜2 分かかります |
| ページが 404 になる | 手順 2 で Pages の Source を **GitHub Actions** にしたか。Actions タブで「Deploy to GitHub Pages」が成功しているか（失敗していたら **Run workflow** で再実行） |
| 「承認済みドメインに登録されていません」 | 手順 6 で `<ユーザー名>.github.io` を追加したか |
| 「Google ログインが有効になっていません」「Authentication が開始されていません」 | 手順 3 で Authentication を始め、Google を有効にしたか |
| 画面が真っ白で、左上に「Dashboard」としか出ない | ブラウザの開発者ツール（Mac は ⌥⌘I、Windows は F12）の **Console** に出ている赤いエラーを確認。下の 2 行もあわせて確認 |
| Console に `does not provide an export named 'firebaseConfig'`（または `FIREBASE_SDK_VERSION` など） | `firebase-config.js` を Firebase コンソールの見本で丸ごと置き換えていないか。手順 5 の「正解の形」に直す |
| Console に `Unexpected identifier` などの `SyntaxError`（`firebase-config.js` で発生） | `const firebaseConfig = {` が二重になっている、カッコや `"` の閉じ忘れがないか |
| 「apiKey が正しくありません」 | `firebase-config.js` の値に貼り間違いがないか |
| 手順 8 の制限をかけたらログインや保存ができなくなった | 許可したサイトに `<ユーザー名>.github.io` と `<プロジェクト ID>.firebaseapp.com` の両方があるか、API の制限に 3 つの API が入っているか |
| 「〇〇 ではこのダッシュボードを使えません」 | 手順 4 のルールの `allowedEmails()` にそのアドレスが**小文字で**入っているか、ルールを**公開**したか |
| 「Firestore のデータベースが見つかりません」 | 手順 4 で Firestore Database を作成したか |
| 「ポップアップがブロックされました」 | ブラウザでこのサイトのポップアップを許可して、もう一度ログイン |
| 変更が反映されない | Actions タブで最新の「Deploy to GitHub Pages」が成功しているか確認し、キャッシュを無視して再読み込み（Mac は ⌘⇧R、Windows は Ctrl+Shift+R）。GitHub Pages のファイルはブラウザに最大 10 分ほどキャッシュされます |
| GitHub から「Publicly leaked secret」の警告が届いた | 下の「GitHub から『Publicly leaked secret』の警告が届いたとき」を参照 |

### GitHub から「Publicly leaked secret」の警告が届いたとき

`firebase-config.js` に `apiKey` をコミットすると、GitHub のシークレットスキャンが Google の API キーとして検出し、
「Publicly leaked secret」という警告を出します。GitHub は Firebase 用のキーかどうかを区別しないためです。

Firebase のウェブ用 API キーは、画面のプログラムに埋め込んで公開する前提の値です。
データを守っているのは Firestore のセキュリティルールなので、キーが知られてもダッシュボードの中身は読まれません。
キーを作り直しても、新しいキーをコミットすればまた同じ警告が出ます。

1. 手順 8 の制限をかけます（まだの場合）。
2. 警告の画面で **Close as → Won't fix** を選び、コメントに「Firebase のウェブ用キー。公開前提で、使えるサイトと API を制限済み」などと書いて閉じます。

キーを作り直したい場合は、次の順で進めます（逆の順にすると、ログインできない時間ができます）。

1. 同じ認証情報の画面で **認証情報を作成 → API キー** を押し、手順 8 と同じ制限をかけます。
2. `firebase-config.js` の `apiKey` を新しいキーに書き換えてコミットし、ログインと保存ができることを確認します。
3. 古いキーを削除し、警告を **Close as → Revoked** で閉じます。

念のため、Firebase コンソールの **Authentication → ユーザー** に知らないアカウントがないか、
**Firestore → 使用状況** で読み書きの回数が急に増えていないかも確認しておくと安心です
（知らないアカウントがあっても、ルールによりデータは読めません。不要なら削除してください）。

## ライセンス

[MIT](LICENSE)
