# Limbus Company 人格単発ガチャ

Limbus Companyの人格一覧から、ソロ攻略で使う人格を1回だけ引く静的Webツール。

## できること

- lcbwikiの人格一覧を元にした185人格からの等確率抽選
- 人格名・囚人・星・シーズンによる抽選対象の絞り込み
- 引いた人格を次回以降の抽選から除外
- 抽選履歴の保存と結果のコピー
- ブラウザだけで動作。サーバーやビルド手順は不要

ゲーム内ガチャの排出率・所持状況・入手可能性は再現していない。

## GitHub Pagesへ置く

このフォルダをGitHubリポジトリのルートへ置いてmainへpushする。
同梱のGitHub ActionsがPagesへデプロイするので、リポジトリの
Settings → Pages → Build and deployment で Source を「GitHub Actions」にする。

## データを更新する

一覧を更新したいときは、ローカルで次を実行してからdata/personas.jsをcommitする。

~~~sh
python3 scripts/update-data.py
~~~

更新用スクリプトは抽選に必要な人格名・囚人・星・シーズン・詳細ページURLだけを保存し、
wikiの画像・スキル説明・解説文はコピーしない。

出典：[LimbusCompany攻略 Wiki*「人格」](https://wikiwiki.jp/lcbwiki/%E4%BA%BA%E6%A0%BC)

## ライセンスについて

このリポジトリのコードは個人利用を想定している。データの扱いと公開範囲は、
出典元の利用方針および各権利者の条件を確認すること。
