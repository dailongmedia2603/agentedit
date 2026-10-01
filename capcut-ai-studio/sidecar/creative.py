#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LUAT SANG TAO + CAM XUC (user 2026-10-01): "ke hoach edit phai sang tao hon, tranh loi mon, dac biet chu trong tao
CAM XUC cho nguoi xem tu am thanh, hieu ung, chuyen canh... — video hieu qua phai thu hut va cho nguoi xem cam xuc".

Mot khoi luat CHUNG (sua duoc trong menu "Prompt & quy tac": _CREATIVE_RULE) + mot dong rieng tung buoc, NOI BANG
CODE vao system prompt cac buoc thiet ke (B3 hook, R4 thiet ke, R5 chu, FX hieu ung, B6 meme, B7 SFX) — ke ca khi
user da sua prompt cua buoc do (giong hook_rule.luat). B1 / B2 (chon + cat noi dung) KHONG noi: luat cung giu thu tu
noi dung, chi cat — sang tao nam o cach the hien, khong o viec doi noi dung.
"""
import prompt_store

_CREATIVE_RULE = """

# SANG TAO + CAM XUC (luat chung cua moi buoc thiet ke — he thong noi vao)
Muc tieu khong phai "co du hieu ung" ma la lam nguoi xem CAM THAY mot dieu cu the o tung doan: to mo, bat ngo, buon
cuoi, xuc dong, tu hao, hoi hop, nhe nhom... Moi lua chon (am thanh, hieu ung, chuyen canh, chu, nhip) phai tra loi
duoc: "khoanh khac nay muon nguoi xem cam thay gi — va lua chon nay DAY cam xuc do len the nao?". Khong tra loi
duoc thi khong dat.
1. DUONG CONG CAM XUC: doc ca cau chuyen truoc, xac dinh cho DANG LEN (cao trao, cu chot, tiet lo), cho LANG XUONG
   (tam su, suy ngam) va cho NGHI. Cuong do hinh + tieng + nhip di theo duong cong do, co tuong phan — KHONG deu deu
   tu dau den cuoi. Truoc cao trao nen co mot nhip lang / don cang de cu chot "no" ra.
2. TRANH LOI MON: khong lap mot cong thuc cho moi cau (chu bat ra + "pop" + zoom nhe lap mai = nham, khan gia luot).
   Cung mot loai khoanh khac lap lai -> doi cach the hien (kieu vao, goc nhin, bo cuc, am thanh) hoac tiet che. Khong
   dung thu gi chi vi "video nao cung co".
3. AM THANH LA NUA CAM XUC: chon tieng theo CAM XUC can tao (am ap, trong sang, hoi hop, hai, soc, nhe nhom), khong chi
   theo loai chuyen dong; tieng phai cung "chat" voi tone video. Mot khoang LANG co chu dich (truoc cu chot, sau cau
   xuc dong) cung la lua chon am thanh manh.
4. CHUYEN CANH + HIEU UNG noi cung ngon ngu cam xuc cua doan: tam su -> mem, cham, am; hao hung -> nhanh, sang, dut
   khoat; bat ngo -> pha nhip co chu dich (dung hinh, doi nhip, phong dot ngot). Chuyen canh dung de chuyen CAM XUC /
   chuyen Y, khong phai chen cho co.
5. DIEM NHO: thiet ke vai khoanh khac "dat" RIENG cho noi dung video nay (y tuong hinh / tieng / chu chi video nay moi
   co, bam vao chi tiet that trong loi noi), thay vi trang tri chung chung.
6. Sang tao NHUNG van tuan thu moi luat cung khac (giu thu tu noi dung, chu ro net + khong che mat, phong cach chi tu
   video mau / tu noi dung, luat hook, muc to SFX theo giong noi, moi chu hien deu co tieng). Phan van -> lay CAM XUC
   THAT cua nguoi noi lam chuan, khong phong dai qua cam xuc do."""

_BUOC = {
    "B3": "\n- Rieng buoc HOOK: chon doan danh vao cam xuc / to mo MANH nhat ma van dung mot minh van hieu; caption hook "
          "phai gay cam xuc hoac cau hoi trong dau nguoi xem, khong tom tat kho khan.",
    "R4": "\n- Rieng buoc THIET KE: bo cuc, lop do hoa, camera, chuyen canh di theo duong cong cam xuc; doi kieu vao "
          "(enter) cua chu / huy hieu theo cam xuc tung luc (khong mac dinh 'pop' cho moi lop); it nhat 2-3 y tuong "
          "hinh rieng cho noi dung video nay.",
    "R5": "\n- Rieng buoc CHU: nhan dung TU mang cam xuc (khong nhan tu vo nghia), cach nhan + kieu hien hop cam xuc "
          "cua cau (nhe cho cau tam su, manh cho cu chot).",
    "FX": "\n- Rieng buoc HIEU UNG: moi hieu ung la de KHUECH DAI cam xuc dang co cua khoanh khac (khong trang tri); "
          "cac hieu ung trong video phai khac nhau ve y tuong, manh / nhe theo duong cong cam xuc.",
    "B6": "\n- Rieng buoc MEME: chi chen khi meme lam cam xuc doan do MANH hon dung tone (hai thi buon cuoi hon, bat ngo "
          "thi soc hon); tone xuc dong / nghiem tuc thi tha khong chen.",
    "B7": "\n- Rieng buoc SFX: ve am thanh theo duong cong cam xuc — tieng nhe / am o doan lang, tieng ro / manh o cao "
          "trao; chon tieng DA DANG tu kho theo cam xuc tung cho (khong lap mot tieng cho moi chu); can nhac mot "
          "nhip lang truoc cu chot de tieng nhan an tuong hon.",
}


def luat(buoc):
    """Khoi luat sang tao + cam xuc noi vao system prompt cua buoc `buoc` (B3 | R4 | R5 | FX | B6 | B7)."""
    return prompt_store.get_prompt("_CREATIVE_RULE", _CREATIVE_RULE) + _BUOC.get(buoc, "")
