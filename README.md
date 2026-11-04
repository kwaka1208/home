# personal-dashboard

よく使うツールへのリンクやメモをまとめた、**自分専用のダッシュボード**です。
Google アカウントでログインした本人だけが見られます。

- 画面のレイアウトはドラッグ＆ドロップで自由に並べ替え
- リンク集・メモ・時計・Web 検索・埋め込み（Google カレンダーなど）の 5 種類のウィジェット
- 編集内容はサーバー（Cloudflare KV）に自動保存されるので、PC でもスマホでも同じ画面
- 見た目は CSS 変数（デザイントークン）で丸ごと着せ替え可能
- このリポジトリを**フォークすれば、誰でも自分用のダッシュボードを無料で持てます**

## しくみ

```
ブラウザ ──▶ Cloudflare Access ──▶ Cloudflare Workers ──▶ Workers KV
            （Google でログイン）   （画面の配信と保存 API）   （ダッシュボードのデータ）
                                         ▲
GitHub（このリポジトリのフォーク）─────────┘ push すると自動デプロイ
```

| 役割 | 使うもの | 費用 |
|---|---|---|
| ソースコードの管理 | GitHub | 無料 |
| 画面の配信・保存 API | Cloudflare Workers（Static Assets） | 無料枠で足ります |
| データの保存 | Cloudflare Workers KV | 無料枠で足ります |
| ログイン（Google 認証） | Cloudflare Zero Trust の Access | 50 ユーザーまで無料 |

### リンクの中身はリポジトリに置きません

公開リポジトリをフォークすると、フォーク先も公開リポジトリになります。
そのため、**あなたが登録したリンクやメモは GitHub には一切保存されず**、Cloudflare KV に
ログインしたメールアドレスごとに保存されます。リポジトリに入っているのは画面のプログラムと、
初回表示用のサンプル（`public/default-dashboard.json`）だけです。

保存 API（`/api/*`）は Access によるチェックに加えて、Worker 自身も Access が発行した
トークン（JWT）の署名・発行元・宛先を検証します。Access の設定を誤って外してしまっても、
データは読み書きできません。

---

## 自分用のダッシュボードを作る手順

所要時間は 30 分ほどです。用意するのは次の 3 つです。

- GitHub アカウント
- Cloudflare アカウント（無料。<https://dash.cloudflare.com/sign-up>）
- Google アカウント（ログインに使うもの）

> Cloudflare と Google Cloud の管理画面は、ときどきメニュー名が変わります。見当たらないときは、
> 各手順に付けた公式ドキュメントのリンクを確認してください。

### 1. リポジトリをフォークする

1. このリポジトリの右上にある **Fork** を押します。
2. 自分のアカウントにコピーができます（例：`your-name/personal-dashboard`）。

フォーク後にファイルを書き換える必要はありません（見た目を変えたいときは後述の
「見た目をカスタマイズする」を参照）。

### 2. Cloudflare Zero Trust を有効にする

1. Cloudflare ダッシュボードの左メニューから **Zero Trust** を開きます。
2. 初回はチーム名（Team name）の入力を求められます。好きな名前を付けます。
   これが **チームドメイン** `<チーム名>.cloudflareaccess.com` になります。
3. プランは **Free** を選びます（支払い情報の登録を求められることがありますが、50 ユーザーまでは無料です）。

チームドメインは後から **Zero Trust → Settings** で確認できます。

### 3. Google ログインを設定する

参考：[Cloudflare Docs - Google](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)

**Google Cloud 側**

1. [Google Cloud Console](https://console.cloud.google.com/) で新しいプロジェクトを作ります（名前は何でも構いません）。
2. **API とサービス → OAuth 同意画面**（Google Auth Platform）を開き、設定を始めます。
   - アプリ名とサポート用メールアドレスを入力
   - 対象（Audience）は **外部（External）** を選択
   - 連絡先を入力して作成
3. **クライアント → クライアントを作成**（OAuth クライアント ID の作成）を開きます。
   - アプリケーションの種類：**ウェブ アプリケーション**
   - 承認済みの JavaScript 生成元：`https://<チーム名>.cloudflareaccess.com`
   - 承認済みのリダイレクト URI：`https://<チーム名>.cloudflareaccess.com/cdn-cgi/access/callback`
4. 作成後に表示される **クライアント ID** と **クライアント シークレット** を控えます。

> 同意画面が「テスト」状態のままだと、**テストユーザーに登録した Google アカウントしかログインできません**。
> 自分だけで使うなら、自分のアドレスをテストユーザーに追加すれば十分です。

**Cloudflare 側**

1. **Zero Trust → Integrations → Identity providers** を開きます。
2. **Add new identity provider** → **Google** を選びます。
3. App ID にクライアント ID、Client secret にクライアント シークレットを貼り付けて保存します。
4. 一覧の Google の横にある **Test** を押し、ログインできることを確認します。

### 4. Cloudflare Workers にデプロイする

1. Cloudflare ダッシュボードで **Workers & Pages → Create** を開きます。
2. **Import a repository**（Git リポジトリを連携）を選び、GitHub と接続して、
   手順 1 でフォークしたリポジトリを選びます。
3. 設定はそのままで構いません。
   - プロジェクト名：`personal-dashboard`（`wrangler.jsonc` の `name` と同じにします）
   - ビルドコマンド：空欄
   - デプロイコマンド：`npx wrangler deploy`
4. **Deploy** を押します。

初回デプロイで、データ保存用の KV ネームスペースも自動で作られます。
完了すると `https://personal-dashboard.<あなたのサブドメイン>.workers.dev` が発行されます。

> この時点で URL を開くと、画面は出ますが「TEAM_DOMAIN と POLICY_AUD が設定されていません」と表示され、
> データは読み書きできません。次の手順で認証をかけます。

### 5. Access でログインを必須にする

参考：[Cloudflare Docs - Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

1. **Workers & Pages** で `personal-dashboard` を開き、**Access** タブを選びます。
2. **Protect this Worker behind Access** を押します。
3. 対象は **All traffic** を選びます。
4. Authentication policy はひとまず **Cloudflare account**（この Cloudflare アカウントのメンバーだけ許可）を選び、
   **Apply Access** で保存します。

続けて、**自分の Google アカウントだけ**が入れるようにポリシーを調整します。

1. **Zero Trust → Access → Applications** を開き、今できたアプリケーションを編集します。
2. **Policies** で許可ルールを次のように変更します。
   - Action：**Allow**
   - Include：**Emails** に自分の Gmail アドレス（家族などにも使わせるなら複数）
3. **Login methods** で **Google** だけにチェックを入れます（**Instant Auth** を有効にすると、選択画面を飛ばして直接 Google に進みます）。
4. 保存します。

> Access タブが見当たらない場合は、**Zero Trust → Access → Applications → Add an application →
> Self-hosted** で、ドメインに `personal-dashboard.<サブドメイン>.workers.dev` を指定して作成しても同じです。

### 6. Worker に Access の情報を教える

Worker がトークンを検証するために、次の値を設定します。

| 変数名 | 値 | 確認場所 |
|---|---|---|
| `TEAM_DOMAIN` | `<チーム名>.cloudflareaccess.com` | Zero Trust → Settings |
| `POLICY_AUD` | Application Audience (AUD) Tag（長い英数字） | Zero Trust → Access → Applications → 手順 5 のアプリの詳細 |
| `ALLOWED_EMAILS`（任意） | 許可するメールアドレスをカンマ区切りで | Access のポリシーに加えて、Worker 側でも絞り込みたいとき |

1. **Workers & Pages → personal-dashboard → Settings → Variables and Secrets** を開きます。
2. **Add** で上の変数を **Text** として追加し、**Deploy** します。

`wrangler.jsonc` に `keep_vars: true` を入れてあるので、GitHub に push して再デプロイしても
ここで設定した値は消えません。

### 7. 使い始める

`https://personal-dashboard.<サブドメイン>.workers.dev` を開くと Google のログイン画面が出ます。
ログインすると、サンプルのレイアウトが表示されます。右下に自分のメールアドレスが出ていれば完了です。

ブラウザのホームページやブックマークに登録しておくと便利です。

---

## 使い方

| 操作 | 方法 |
|---|---|
| 編集を始める／終える | 右上の **編集** ボタン（編集中は **完了**） |
| ウィジェットを並べ替える | 編集中に、見出し左の **⠿** をドラッグ |
| リンクを並べ替える・別のウィジェットへ移す | 編集中に、リンクをドラッグ |
| ウィジェットを追加 | 編集中に、末尾の **＋ ウィジェットを追加** |
| ウィジェットの名前・幅・色を変える | 編集中に、見出し右の **✎** |
| リンクを追加 | 編集中に、リンク集の見出し右の **＋** |
| リンクを編集・削除 | 編集中に、リンクをクリック（または **✎**） |
| リンクを絞り込む | 上部の検索欄（`/` キーで移動、Enter で先頭のリンクを開く） |
| 配色・テーマ・バックアップ | 右上の **⚙** |

スマートフォンでは、少し長押ししてからドラッグすると並べ替えられます。

### ウィジェットの種類

| 種類 | できること |
|---|---|
| リンク集 | リンクを「リスト」または「タイル」で表示。アイコンは絵文字・画像 URL・サイトのファビコンから選べます |
| メモ | 自由に書けるメモ欄。入力すると自動保存 |
| 時計 | 現在時刻と日付。タイムゾーン（例：`America/New_York`）も指定可能 |
| Web 検索 | 検索 URL を変えれば Google 以外（社内 Wiki、GitHub 検索など）にも使えます |
| 埋め込み | Google カレンダーの埋め込み URL など、iframe で表示できるページ |

幅は S（1 列）・M（2 列）・L（3 列）・XL（全幅）から選べます。
画面が狭くなると、自動で 2 列 → 1 列に詰まります。

> アイコン未設定のリンクは、Google のファビコン取得サービスからアイコンを読み込みます
> （リンク先のドメイン名が Google に送られます）。気になる場合は ⚙ でオフにできます。

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
| `public/css/themes.css` | 設定画面で選べるテーマのプリセット | テーマを増やしたいとき |
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
    --font-sans: "BIZ UDPGothic", sans-serif;
  }
}
```

本家は `custom.css` を空のまま保つので、本家の更新を取り込むときに衝突しません。

### 主な CSS 変数

| 変数 | 意味 |
|---|---|
| `--color-bg` / `--color-surface` | ページの背景 / ウィジェットの背景 |
| `--color-surface-muted` / `--color-surface-hover` | 控えめな面（タイル・メモ欄）/ ホバー時 |
| `--color-text` / `--color-text-muted` | 文字色 / 補足の文字色 |
| `--color-accent` / `--color-accent-contrast` | アクセント色 / その上に載せる文字色 |
| `--color-border` / `--color-danger` / `--color-focus` | 枠線 / 削除ボタン / フォーカス枠 |
| `--font-sans` / `--font-mono` | 本文 / 時計のフォント（標準は各 OS のシステムフォント） |
| `--font-size-*`（`xs` `sm` `md` `lg` `xl` `clock`） | 文字サイズ |
| `--space-1` 〜 `--space-6` | 余白の段階（4px 〜 32px） |
| `--radius-sm` / `--radius-md` / `--radius-lg` | 角丸 |
| `--shadow-widget` / `--shadow-raised` | ウィジェット / ダイアログ・ドラッグ中の影 |
| `--page-max-width` / `--page-gutter` | ページの最大幅 / 画面端の余白 |
| `--grid-columns` / `--grid-gap` | 広い画面での列数 / ウィジェットの間隔 |
| `--widget-padding` | ウィジェット内側の余白 |
| `--link-tile-min` / `--icon-size` / `--icon-size-tile` | タイル 1 個の最小幅 / アイコンの大きさ |
| `--widget-accent` | ウィジェットごとの色（✎ で設定した色が入る。未設定なら `--color-accent`） |

### 部品ごとに変える

クラス名は「部品\_\_要素--状態」（BEM）で付けています。

```css
@layer custom {
  /* 壁紙を敷いて、ウィジェットをすりガラス風に */
  body {
    background: url("../images/wallpaper.jpg") center / cover fixed;
  }
  .widget {
    background: color-mix(in srgb, var(--color-surface) 75%, transparent);
    backdrop-filter: blur(10px);
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
| `.widget__header`, `.widget__title`, `.widget__body` | ウィジェットの見出し・本文 |
| `.link-list--list`, `.link-list--grid` | リンクのリスト表示 / タイル表示 |
| `.link`, `.link__icon`, `.link__title`, `.link__desc` | リンク 1 件 |
| `.note`, `.clock__time`, `.clock__date`, `.web-search`, `.embed` | 各ウィジェットの中身 |
| `.button`, `.button--primary`, `.input`, `.dialog` | ボタン・入力欄・ダイアログ |
| `html[data-mode="light"]`（`dark`） | 配色を固定しているとき（自動のときは付かない） |
| `html[data-preset="..."]` | テーマのプリセットを選んでいるとき |
| `html[data-editing]` | 編集モード中 |

### テーマのプリセットを増やす

設定画面の「テーマ」に選択肢を足すこともできます。

1. `public/css/themes.css` にブロックを追加します。

   ```css
   @layer themes {
     :root[data-preset="sakura"] {
       --color-bg:     light-dark(#fdf3f5, #1c1416);
       --color-accent: light-dark(#c2185b, #f48fb1);
       --color-focus:  light-dark(#c2185b, #f48fb1);
     }
   }
   ```

2. `public/js/config.js` の `THEME_PRESETS` に `{ id: "sakura", label: "桜" }` を追加します。

### 初期レイアウトを変える

ログインして**初めて**開いたときのレイアウトは `public/default-dashboard.json` です。
フォーク先は公開リポジトリなので、**人に見られて困るリンクは書かないでください**
（自分のリンクは画面から追加すれば KV に保存され、公開されません）。

---

## 本家の更新を取り込む

フォークした GitHub のページで **Sync fork → Update branch** を押すと、本家の更新を取り込めます。
Cloudflare が自動で再デプロイします。データ（KV）と環境変数はそのまま残ります。

カスタマイズを `custom.css` と `themes.css` への追記に留めておくと、衝突しにくくなります。

---

## ローカルで動かす（開発する人向け）

Node.js 20 以降が必要です。

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run dev
```

<http://localhost:8787> を開きます。ローカルでは Access がないため、`.dev.vars` の
`DEV_AUTH_EMAIL` のメールアドレスでログインしているものとして動きます
（この設定は localhost 以外では無視されます）。データは `.wrangler/` 以下に保存されます。

### ファイル構成

```
public/                     ブラウザに配信されるファイル
  index.html                画面の骨組み
  default-dashboard.json    初回表示のレイアウト
  css/                      スタイル（上記「見た目をカスタマイズする」参照）
  js/app.js                 画面の描画・編集・ドラッグ＆ドロップ
  js/storage.js             読み込みと保存（API と localStorage）
  js/config.js              テーマ一覧などの設定
  vendor/Sortable.min.js    並べ替えライブラリ SortableJS（MIT）
src/worker.js               保存 API と Access トークンの検証
wrangler.jsonc              Cloudflare Workers の設定
```

### API

すべて Cloudflare Access の認証が必要です。

| メソッド | パス | 内容 |
|---|---|---|
| `GET` | `/api/me` | ログイン中のメールアドレス |
| `GET` | `/api/dashboard` | ダッシュボードのデータ（未保存なら 404） |
| `PUT` | `/api/dashboard` | ダッシュボードのデータを保存（JSON、512KB まで） |

---

## 困ったとき

| 症状 | 確認すること |
|---|---|
| 「TEAM_DOMAIN と POLICY_AUD が設定されていません」 | 手順 6 の変数を設定して **Deploy** したか |
| 「AUD が一致しません」 | `POLICY_AUD` が、手順 5 のアプリの AUD Tag と同じか（前後の空白に注意） |
| 「Cloudflare Access のトークンがありません」 | 手順 5 の Access が `workers.dev` の URL にかかっているか |
| 「このアカウントには許可がありません」 | `ALLOWED_EMAILS` にログインしたアドレスが入っているか |
| Google のログインで「アクセスをブロック」と出る | Google の OAuth 同意画面のテストユーザーに自分を追加したか |
| 「サーバーに保存できないため、このブラウザにだけ保存しています」 | `index.html` を直接開いている、または API に届いていない |
| しばらく放置したら保存できない | Access のログインの期限切れです。ページを再読み込みしてください |
| デプロイで KV の作成に失敗する | **Workers & Pages → KV** でネームスペースを作り、`wrangler.jsonc` の `kv_namespaces` に `"id": "<作った ID>"` を追記してください |

## ライセンス

[MIT](LICENSE)
