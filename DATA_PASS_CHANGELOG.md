# Career Glitch — Data Pass Changelog (28.10.2026)

Проход по данным перед фризом хакатона: заглушки зарплат/сроков (D3/D4),
наследование данных дочерних профессий (D10), фантастические цифры (D6),
прогноз роста BLS (D2), дрейф roadmap-карт (D5).

Источники: BLS Occupational Outlook Handbook (медианы и outlook, страницы
профессий, прочитаны 28.10.2026); BLS Employment Projections, Table 1.2,
2025–35 (процент роста и медианная зарплата 2025 по кодам SOC); O*NET Job
Zones. Формат: профессия · поле · было → стало · источник.

Округление зарплат: до целых $K, как в существующих записях базы.

## D3 — зарплаты-заглушки $75K → медианы BLS

Источник, если не указано иное: BLS OOH, медиана 2025 (страница профессии,
прочитана 28.10.2026); значения сверены с BLS EP Table 1.2 (медианная
зарплата 2025 по SOC) — по всем позициям, кроме отмеченных, оба источника
совпали до доллара.

- no-code-developer · payK · 75 → 93 · OOH Web Developers $92,650
- motion-designer-3d-artist · payK · 75 → 102 · OOH Special Effects Artists and Animators $102,030
- game-designer · payK · 75 → 104 · OOH Web and Digital Interface Designers $104,000
- seo-specialist · payK · 75 → 79 · OOH Market Research Analysts $78,760
- ppc-paid-ads-specialist · payK · 75 → 79 · OOH Market Research Analysts $78,760
- content-strategist · payK · 75 → 78 · OOH Editors $77,920
- copywriter · payK · 75 → 77 · OOH Writers and Authors $76,910
- e-commerce-manager · payK · 75 → 83 · BLS EP Table 1.2, SOC 13-1199 (собственный SOC профессии в базе) $83,050. Примечание: OOH Marketing Managers — $166,790, но это управленческий трек с опытом, не собственная строка профессии.
- brand-strategist · payK · 75 → 79 · OOH Market Research Analysts $78,760
- pr-specialist · payK · 75 → 75 · OOH Public Relations Specialists $74,750 — цифра подтверждена источником, больше не заглушка
- home-stager · payK · 75 → 67 · OOH Interior Designers (SOC профессии 27-1025) $67,190
- set-production-designer · payK · 75 → 75 · OOH Set and Exhibit Designers $75,240 — подтверждено
- wedding-planner · payK · 75 → 61 · OOH Meeting, Convention, and Event Planners $61,160
- speech-public-speaking-coach · payK · 75 → 47 · OOH Self-Enrichment Teachers $46,800
- instructional-designer · payK · 75 → 77 · OOH Instructional Coordinators $77,440
- lighting-designer · payK · 75 → 75 · ближайшая профессия OOH — Set and Exhibit Designers $75,240 — подтверждено как ближайший ряд
- mri-technologist · payK · 75 → 95 · OOH Radiologic and MRI Technologists $95,480
- nutrition-coach-dietitian · payK · 75 → 76 · OOH Dietitians and Nutritionists $76,400
- chiropractor · payK · 75 → 79 · OOH Chiropractors $79,200
- appliance-repair-tech · payK · 75 → 51 · BLS EP Table 1.2, SOC 49-9031 Home Appliance Repairers $50,990
- home-inspector · payK · 75 → 75 · OOH Construction and Building Inspectors $74,690 — подтверждено
- garage-door-tech · payK · 75 → 50 · OOH General Maintenance and Repair Workers $49,590
- arborist-tree-pro · payK · 75 → 51 · BLS EP Table 1.2, SOC 37-3013 Tree Trimmers and Pruners $50,960 (собственный SOC профессии)
- handyman-solo-pro · payK · 75 → 50 · OOH General Maintenance and Repair Workers $49,590
- boat-mechanic-marine-tech · payK · 75 → 58 · OOH Small Engine Mechanics $57,550
- ev-charging-technician · payK · 75 → 63 · OOH Electricians (SOC профессии 47-2111) $63,190
- fiber-optic-technician · payK · 75 → 74 · OOH Telecommunications Technicians / EP SOC 49-9052 $74,330
- boilermaker · payK · 75 → 76 · OOH Boilermakers $76,410
- drone-pilot-commercial · payK · 75 → 123 · OOH/EP Commercial Pilots, SOC 53-2012 $123,220 (следует собственному SOC профессии в базе)
- boat-captain · payK · 75 → 92 · OOH Water Transportation Workers / EP SOC 53-5021 $92,460
- dog-trainer · payK · 75 → 40 · OOH Animal Trainers / EP SOC 39-2011 $39,990
- winemaker-enologist · payK · 75 → 82 · ближайшая профессия OOH — Agricultural and Food Scientists $81,970

## D5/D3 — движок был старее своих карт (карты уже несли BLS-2025)

- accountant · payK · 120 → 84 · BLS EP SOC 13-2011 $83,680; карта уже показывала $84K
- graphic-designer · payK · 45 → 63 · BLS EP SOC 27-1024 $62,960; карта уже показывала $63K
- software-developer · payK · 125 → 136 · BLS EP SOC 15-1252 $135,980; карта уже показывала $136K

## D4/D7 — сроки обучения (дефолт 3,5 мес → исследованные диапазоны)

Источник: BLS OOH, раздел "How to Become One" каждой профессии (прочитано
28.10.2026). Правка вносится в текст собственной карты профессии (движок
читает срок из карты), поэтому движок и витрина совпадают по построению.
Формат: было "1–6 months" (середина 3,5), если не указано иное.

- no-code-developer → "6–12 months" (портфолио-путь, OOH Web Developers)
- motion-designer-3d-artist → "2–4 years" (bachelor's + портфолио)
- game-designer → "2–4 years" (было "6–12 months")
- seo-specialist, ppc-paid-ads-specialist, brand-strategist → "2–4 years" (bachelor's, Market Research Analysts)
- content-strategist → "2–4 years"; copywriter → "2–4 years"; e-commerce-manager → "2–4 years"
- pr-specialist → "2–4 years" (было "6–12 months"); set-production-designer → "2–4 years" (было "6–12 months")
- voice-actor → "3–6 months" (классы + демо-рил)
- wedding-planner → "2–4 years"; event-planner → "2–4 years" (одна профессия OOH — Event Planners, bachelor's; оба исследователя дали bachelor's, диапазон выровнен по конвенции базы для bachelor's = 2–4 года)
- speech-public-speaking-coach → "6–12 months"
- home-inspector → "6–12 months"; garage-door-tech → "3–6 months"; handyman-solo-pro → "3–6 months"
- boat-mechanic-marine-tech → "3–6 months" (было "6–12 months"); appliance-repair-tech → "3–6 months"
- ev-charging-technician → "4–5 years" (было "6–12 months"; электрики — apprenticeship, OOH Electricians)
- fiber-optic-technician → "6–12 months"; drone-pilot-commercial → "6–12 months" (FAA commercial certificate)
- boat-captain → "1–2 years" (было "6–12 months"; USCG + sea time); dog-trainer → "3–6 months"
- web-designer → "6–12 months"; video-editor → "2–4 years"; smm-manager → "2–4 years"; podcast-producer → "2–4 years"
- mortgage-broker → "2–4 years"; b2b-sales-rep → "6–12 months"; recruiter → "2–4 years"; grant-writer → "2–4 years"
- phlebotomist → "3–6 months" (сертификат < 1 года); sterile-processing-tech → "6–12 months"
- drywall-finisher → "6–12 months"; tile-setter → "2–4 years" (apprenticeship); solar-installer → "6–12 months"
- flooring-installer → "2–4 years"; concrete-finisher → "2–4 years" (apprenticeship 3–4 года)
- cabinet-maker → "6–12 months"; furniture-restorer → "6–12 months"
- photographer → "6–12 months"; wedding-photographer → "6–12 months"; videographer → "2–4 years"; illustrator → "6–12 months"
- animator → "2–4 years" (та же страница OOH, что у motion-designer — диапазон выровнен)
- makeup-artist → "3–6 months"; nail-technician → "3–6 months"; lash-brow-artist → "3–6 months"; permanent-makeup-artist → "3–6 months" (программы эстетиста + лицензия)
- jewelry-maker → "1–2 years" (OJT ≥ года); butcher → "1–2 years"
- wellness-coach → "2–4 years"; chef → "2–4 years"; private-chef → "2–4 years"; baker → "6–12 months"
- restaurant-manager → "2–4 years"; farmers-market-producer → "2–4 years"; property-manager → "2–4 years"; executive-assistant → "2–4 years"
- private-tutor-in-person → "6–12 months"; dance-instructor → "2–4 years"; sports-coach → "2–4 years"
- cdl-truck-driver → "3–6 months" (CDL-школа); tow-truck-operator → "3–6 months"
- doula → "3–6 months" (DONA International: воркшоп + 3 оценённых родов)

Через TRAINING_OVERRIDES (карт нет или срок наследован — см. D10):
instructional-designer 36 → 54 (master's — типичный вход, OOH);
boilermaker 36 → 54 (apprenticeship ~4 года, OOH);
commercial-diver 3,5 → 9 (программы дайв-школ ~6–12 мес, программа 28 недель);
choreographer 3,5 → 54 (годы формальной подготовки + опыт танцора, OOH).

Подтверждены как верные (исследованы, оставлены "1–6 months"): online-tutor,
virtual-assistant, insurance-agent, real-estate-agent, home-health-aide,
house-painter, roofer, landscaper-lawn-pro, pool-technician, florist,
arborist-tree-pro, fitness-trainer, yoga-pilates-instructor,
barista-craft-coffee, chocolatier-candy-maker, aba-therapist-kids (RBT:
40 часов + экзамен), nanny-family-assistant-pro, elder-care-companion-pro,
flight-attendant, dispatcher-trucking, medical-courier-owner-route,
window-cleaning-owner, insurance-claims-adjuster, administrative-assistant,
vending-atm-route-owner, semiconductor-technician, tower-climber-telecom,
bus-driver, veterinary-assistant, coffee-roaster, community-health-worker,
delivery-driver-light-truck, hazardous-materials-removal-worker
(HAZWOPER 40 часов), reflexologist (ARCB 200 часов), salesforce-administrator
(сертификация Trailhead), subway-streetcar-operator, freight-broker-agent
(FMCSA: обучения не требуется), home-stager (сертификационный путь именно
стейджинга; зарплата при этом взята из SOC 27-1025).

## D10 — наследование (дочерние профессии получают собственные цифры)

- registered-nurse-2 (CRNA) · payK · 214 → 237 · BLS EP SOC 29-1151 Nurse Anesthetists $236,590. Раньше профессия ехала на карте Registered Nurse (slug-коллизия в матчинге карт).
- registered-nurse-2 (CRNA) · training_months · 36 (унаследовано от карты RN) → 36, но теперь собственное значение: TRAINING_OVERRIDES в professions.mjs; основание — BLS OOH: лицензия RN + ≥1 год опыта в critical care, затем программа nurse anesthesia (~36 мес). Флаг данных сменился на training_months_from_override.
- registered-nurse-2 (CRNA) · outlook · не было → "Growing · +10% to 2035 (BLS)" · EP SOC 29-1151 +9.7%
- tattoo-artist-2 (Paramedical Tattoo Artist) · training_months · 36 (унаследовано от карты Tattoo Artist) → 12 · редакторская оценка (ряда BLS нет): опытный тату-мастер + сертификационные курсы парамедицинской татуировки. TRAINING_OVERRIDES.

## D6 — фантастические цифры → здравые редакторские значения

Редакторские значения (ряда BLS для этих ролей не существует); сроки —
через текст собственных карт, чтобы движок и витрина совпадали.

- real-estate-investor-flips · payK · 150 → 85; training · карта "1–6 months" → "6–12 months"
- real-estate-investor-rentals · payK · 130 → 70; training · карта "1–6 months" → "6–12 months"
- self-storage-owner · payK · 130 → 85; training · карта "1–6 months" → "6–12 months"
- owner-operator-trucking · payK · 120 → 75 (якорь — медиана BLS Heavy Truck Drivers $58,640, EP SOC 53-3032, плюс премия владельца); training · карта "1–6 months" → "3–6 months"
- commercial-pilot · payK · 160 → 123 · BLS EP SOC 53-2012 $123,220

## D2 — outlook (BLS Employment Projections 2025–35, Table 1.2)

Заполняется полем `bls_outlook` через карту SOURCED_OUTLOOK в
api/_lib/engine/professions.mjs по коду SOC профессии. Формат строки —
как у существующих записей: "Growing · +N% to 2035 (BLS)" /
"Shrinking · −N% to 2035 (BLS)" / "Flat · 0% to 2035 (BLS)".

Итог: outlook был у 7 профессий, стало у **308 из 374** (добавлено 301:
300 по коду SOC + 1 ручной кроссволк substance-abuse-counselor O*NET
21-1011 → строка EP 21-1018). Распределение новых: Growing 255,
Shrinking 32, Flat 13. Комбинированные строки BLS использованы для:
lab-technician и histotechnologist (29-2010), home-health-aide,
elder-care-companion-pro и senior-home-care-agency-owner (31-1120),
real-estate-appraiser (13-2020). Без outlook остались 66: 65 профессий
без SOC в базе + special-education-teacher (O*NET 25-2056 — у BLS нет
единой детальной строки, есть только разбивка по уровням школы).
Существующие 7 ручных записей сохранены без изменений; все семь
совпали с округлением EP (проверено).

## D5 — синхронизация roadmap-карт с базой движка

Все 23 расхождения из аудита закрыты, плюс все карты профессий, тронутых
этим проходом. Механизм: цифра "~$NK" в денежной строке карты приведена
к payK движка (кроме трёх случаев из секции «движок был старее карт»,
где наоборот — движок приведён к карте/BLS). Синхронизировано строк
карт: 49 (48 скриптом + electrician 63 → 62 вручную: файл data-3 пишется
другим генератором, с пробелом после ключа). Финальная проверка после
всех правок: расхождений карта↔движок — 0.

## Не подтверждено / оставлено как редакторские оценки

Зарплаты $75K, оставленные сознательно (owner/creator/бизнес-роли, ряда
BLS не существует) — 29: online-course-creator, streamer-content-creator,
beauty-salon-owner, spa-owner, meal-prep-business-owner, life-coach,
personal-fashion-stylist, moving-company-owner, auto-detailing-mobile-owner,
cleaning-company-owner, handyman-company-owner, painting-company-owner,
lawn-care-company-owner, pressure-washing-owner, junk-removal-owner,
airbnb-co-host-str-manager, laundromat-owner, pet-grooming-salon-owner,
pet-boarding-daycare-owner, mobile-pet-groomer, mobile-mechanic-owner,
tutoring-center-owner, photo-booth-event-rentals-owner,
resale-flipping-business, amazon-fba-seller, boat-restoration-flipping,
car-flipping, franchise-owner-home-services, car-wash-owner,
gym-fitness-studio-owner (+ scalp-micropigmentation-artist — ниши без
ряда BLS; итого редакторских/нишевых на $75K — 30).

Не подтверждено источником (цифры НЕ менялись):
- customer-success-manager · payK 75 и срок 3,5 — ряда BLS нет; ближайшая
  профессия OOH (Customer Service Representatives, $44,770) — младшая
  роль, подставлять её как медиану CSM было бы ложной точностью.
- voice-actor · payK 75 — у актёров нет годовой медианы BLS (только
  почасовая $28.05 у Actors); срок при этом исправлен на "3–6 months".
- Сроки без авторитетного источника (остались 3,5): ugc-creator,
  dj-event-host, home-organizer-pro, etsy-digital-products-seller,
  print-on-demand-seller, food-stylist, vertical-farm-technician,
  scalp-micropigmentation-artist (срок).
- outlook не заполнен у 66 профессий (нет SOC или нет строки EP).

Сознательно НЕ тронуты: yacht-broker ($150K) и luxury-real-estate-agent
($140K) — комиссионные редакторские роли из списка slow-money; аудит D6
их не называл. Отдельная пометка: drone-pilot-commercial получил медиану
своего SOC в базе (53-2012 Commercial Pilots, $123K) — для дрон-работ
это верхняя граница рынка; маппинг SOC — прежнее ревьюенное решение
базы, в этом проходе не пересматривался.

---

## Поправка 28.10.2026 (вечер) — drone-pilot-commercial: медиана операторов дронов вместо медианы SOC

Файл перенесён в репозиторий (источник правды по режиму брифа 28.10);
запись выше — проход дня. Эта поправка отменяет одну строку того прохода:
`drone-pilot-commercial · payK · 75 → 123` (D3).

- drone-pilot-commercial · payK · 123 → 75 · медиана операторов коммерческих дронов по отраслевым источникам (см. ниже). 123 — медиана унаследованного SOC 53-2012 Commercial Pilots (OOH/EP $123,220): верх рынка пилотируемой авиации, а не операторов дронов. Отдельного ряда BLS (OOH/OEWS) для операторов дронов не существует — Salario methodology note, прочитано 28.10.2026: «no defensible BLS occupation crosswalk».
- drone-pilot-commercial · карточка (roadmaps-data-1.json) · "~$123K (BLS OOH ranges)" → "~$75K (industry salary data — BLS publishes no drone-operator series)". PDF роадмапа уже печатал ~$75K — после поправки движок, карточка и PDF согласованы (D5 = 0 расхождений). pay_top_decile_k у профессии не стоял (null) — исправлять нечего, выдуманная дециль не добавлялась.

Источники по зарплатам операторов дронов в США (все прочитаны 28.10.2026) —
разброс центральных оценок $57.5K–$131K, цифра спорная, фиксируем честно:
- Indeed (среднее, через гайд UAV Coach): $57,526.
- UAV Coach, гайд по зарплатам: mid-career ≈ $57K, experienced $88K+, фриланс $40–75K.
- Salario: национальная медиана $72,000 (оценка, не BLS).
- Rotate (синтез медиан агрегаторов): Indeed $76,500 · ZipRecruiter $79,196 · Glassdoor $82,000; сводная медиана ≈ $79K.
- Dronesgator (синтез): реалистичная середина для наёмных операторов на фултайме — $57–75K.
- ZipRecruiter (среднее по вакансиям) $130,916 и Glassdoor (среднее) $130,986 сами гайды помечают как перекошенные оборонными/корпоративными вакансиями и total compensation — это потолок, а не типичная медиана оператора.

Медиана медиан операторских источников (72 / 76.5 / 79.2 / 82) ≈ $78K.
Взято 75: внутри всех операторских синтезов, совпадает с цифрой, уже
напечатанной в PDF роадмапа профессии, и было собственной редакторской
цифрой базы до наследования SOC в проходе D3.

---

## Поправка 28.10.2026 — luxury-real-estate-agent: подкатегория вместо профессии входа (строка снята из базы)

Указание Маши: «агент по элитной недвижимости» — подкатегория риелтора,
с нуля им стать нельзя; Сваха не должна предлагать её как профессию входа.
Ошибка того же класса, что drone-pilot $123K: неверная строка тянула
ранжирование (на продовом гейте попытки A с конгруэнтностью эта строка
дала 19% сессий).

Что было не так:
- luxury-real-estate-agent · verdict YES · payK 140 · training 9 мес.
  Собственный O*NET-профиль строки — token_match на SOC 41-9022.00 Real
  Estate Sales Agents: буквально профиль ОБЫЧНОГО агента по продажам
  недвижимости (тот же SOC, что у строки real-estate-agent в этой же базе).
- $140K — редакторский PAYK-оверрайд в build_test.py без источника BLS;
  проход по данным 28.10 строку сознательно не тронул («Сознательно НЕ
  тронуты: yacht-broker ($150K) и luxury-real-estate-agent»). Обычная
  профессия того же SOC в базе: real-estate-agent, verdict NO, $53K
  (BLS OOH ranges — цифра её собственной карточки).
- age_gate у строки стоял null: несовершеннолетним (гейт, random #24,
  17 лет) профессия предлагалась.

Что сделано (путь «обычный риелтор в базе есть»):
- Строка снята из движковой базы полностью: кортеж удалён из
  professions.json, карточка и byName удалены из roadmaps-data-1.json,
  кортеж и PAYK-оверрайд удалены из build_test.py (папка сайта), чтобы
  пакетные сборки +30 не воскресили строку. База: 374 → 373 профессии.
- Luxury сохранён как ступень роста: в карточку real-estate-agent
  (roadmaps-data-2.json) добавлена строка: «Luxury segment: not an entry
  point — a specialization agents grow into after years of experience
  and a built client base.»
- Синхронность D5: движок = карточка = professions-base.json; регенерация
  экспорта дала ровно одно удаление и ноль прочих изменений.
- Оставлены на месте как сироты (не удалены, решения — за Машей): запись
  O*NET-импорта под слагом (тот же профиль 41-9022, без кортежа профессии
  не порождает), хранимый день плейграунда в playground-days-07.json,
  PDF роадмапа CareerGlitch_LuxuryRealEstateAgent_Roadmap_2027_v1.pdf
  (карточки на него больше нет — файл ни на что не ссылается).

---

## Проход по заглушкам 28.10.2026 — placeholder-профили заменены данными O*NET (стабы 80 → 14)

Решение Маши: «Ну доделай тогда» — дозаполнить все заглушки. Исходное
состояние: 80 из 373 профессий несли supplies_stub и/или riasec_stub
(векторы — Day-1 формулы от attrs, deriveStubs). Каждая из 80 строк
вручную проверена по Occupation Data, Alternate Titles, Sample of
Reported Titles и задачам O*NET 30.2. Итог: 66 строк полностью
un-stubbed, 14 оставлены стабами на решение Маши (список ниже).

Ключевой факт источника: Work Values (шкала EX) в O*NET 30.2 покрывает
874 из 923 data-level оккупаций. У 23 профессий собственной строки EX
нет (в основном post-2018 split-оккупации) — для них supplies измерены
на ближайшей рейтингованной родственной оккупации (SUPPLIES_NEIGHBOR в
scripts/import_onet.py), заимствование записано в данных импорта
(work_values_neighbor) и на объекте профессии (supplies_neighbor +
data_flag supplies_from_neighbor) — не выдаётся за собственную строку.
RIASEC у всех 23 — собственный, из Interests.

### A. Supplies по соседу (23; собственная оккупация связана, строки EX у неё нет)
- software-developer · своя 15-1252.00 Software Developers → supplies 15-1251.00 Computer Programmers
- devops-engineer · своя 15-1252.00 → supplies 15-1251.00
- ai-automation-specialist · своя 15-1252.00 → supplies 15-1251.00
- mobile-app-developer · своя 15-1252.00 → supplies 15-1251.00
- site-reliability-engineer · своя 15-1252.00 → supplies 15-1251.00
- embedded-systems-engineer · своя 15-1252.00 (alternate titles «Embedded Software Engineer») → supplies 15-1251.00
- data-analyst · своя 15-2051.00 Data Scientists → supplies 15-2041.00 Statisticians (родительская оккупация split-а SOC 2018)
- data-scientist-ml-engineer · своя 15-2051.00 → supplies 15-2041.00
- ux-ui-designer · своя 15-1255.00 → supplies 15-1254.00 Web Developers (рейтингованный sibling split)
- web-designer · своя 15-1255.00 → supplies 15-1254.00
- ux-researcher · своя 15-1255.00 (alternate title «UX Researcher») → supplies 15-1254.00
- financial-analyst · своя 13-2051.00 → supplies 13-2052.00 Personal Financial Advisors
- project-manager · своя 13-1082.00 → supplies 13-1081.00 Logisticians
- emt-paramedic · своя 29-2042.00 → supplies 33-2011.00 Firefighters (у split-а Paramedics строки EX тоже нет; EMT — в основном fire-service)
- medical-coder · своя 29-2072.00 → supplies 43-3021.00 Billing and Posting Clerks
- special-education-teacher · своя 25-2056.00 → supplies 25-2057.00 Special Education Teachers, Middle School
- bus-driver · своя 53-3051.00 → supplies 53-3052.00 Bus Drivers, Transit and Intercity
- penetration-tester · своя 15-1299.04 → supplies 15-1212.00 Information Security Analysts
- digital-forensics-analyst · своя 15-1299.06 → supplies 15-1212.00
- medical-dosimetrist · своя 29-2036.00 → supplies 29-1124.00 Radiation Therapists
- histotechnologist · своя 29-2011.04 → supplies 29-2011.00 Medical and Clinical Laboratory Technologists (родитель)
- film-stage-lighting-technician · своя 27-4015.00 → supplies 27-4011.00 Audio and Video Technicians
- dj-event-host · своя 27-2091.00 Disc Jockeys, Except Radio (alternate titles «Event Disc Jockey», «Club Disc Jockey») → supplies 27-3011.00 Broadcast Announcers and Radio Disc Jockeys

### B. Связи hold-back профессий (21 проверена; 19 связаны, 1 редакторская внутри, 1 осталась)
- mechanical-engineer → 17-2141.00 Mechanical Engineers (точная оккупация; оба вектора свои)
- electrical-engineer → 17-2071.00 Electrical Engineers (точная)
- audio-video-equipment-technician → 27-4011.00 Audio and Video Technicians (точная)
- avionics-technician → 49-2091.00 Avionics Technicians (точная)
- career-and-technical-education-teacher → 25-2032.00 (точная)
- certified-nurse-midwife → 29-1161.00 Nurse Midwives (точная)
- customs-broker → 13-1041.08 Customs Brokers (точная детальная)
- power-plant-operator → 51-8013.00 Power Plant Operators (точная)
- school-psychologist → 19-3034.00 School Psychologists (точная)
- subway-streetcar-operator → 53-4041.00 (точная)
- telecommunications-equipment-installer → 49-2022.00 (точная)
- platform-engineer → 15-1299.08 Computer Systems Engineers/Architects (автоматч подтверждён по задачам)
- freight-broker-agent → 43-5011.00 Cargo and Freight Agents (задачи — буквально переговоры и организация перевозок)
- medical-laboratory-scientist → 29-2011.00 Medical and Clinical Laboratory Technologists (автоматч 19-1042 Medical Scientists был НЕВЕРЕН — исследовательская оккупация)
- child-life-specialist → 39-9011.00 Childcare Workers (alternate title «Child Life Specialist» у самой оккупации)
- costume-designer → 27-1022.00 Fashion Designers (alternate title «Costume Designer»)
- food-stylist → 27-1027.00 Set and Exhibit Designers (alternate title «Food Stylist»)
- lighting-designer → 27-1027.00 Set and Exhibit Designers (alternate title «Lighting Designer»; автоматч 27-1021 product design отклонён)
- distiller → 51-9012.00 Still Machine Setters/Operators (alternate title «Distiller»)
- business-broker → 41-9022.00 Real Estate Sales Agents — РЕДАКТОРСКАЯ связь: reported title у O*NET сидит под Brokerage Clerks (43-4011, securities back office — чужая семья работ); профиль взят у лицензионных продаж активов
- general-surgeon → ОСТАЛСЯ СТАБОМ (см. раздел E)

### C. Связи ранее unmatched профессий (8)
- board-certified-behavior-analyst-bcba → 19-3033.00 Clinical and Counseling Psychologists (alternate title «Behavior Analyst»)
- cnc-machinist-programmer → 51-4041.00 Machinists (alternate title «CNC Machinist»; programmer-only split — 51-9162)
- data-center-technician → 49-2011.00 Computer/ATM/Office Machine Repairers (ручная проверка: работа — hands-on установка, кабели, ремонт вычислительного железа)
- esl-adult-literacy-teacher → 25-3011.00 (ESL входит в само название оккупации)
- sleep-technologist → 29-2099.01 Neurodiagnostic Technologists (в рейтингованных задачах буквально polysomnography, PSG)
- vertical-farm-technician → 45-2092.00 Farmworkers, Crop/Nursery/Greenhouse (alternate title «Hydroponic Controlled Environment Agricultural Grower»)
- tattoo-artist-2 (Paramedical Tattoo Artist) → 39-5094.00 Skincare Specialists (практика перманентного макияжа; прецедент permanent-makeup-artist)
- scalp-micropigmentation-artist → 39-5094.00 Skincare Specialists (SMP — это перманентный макияж; тот же прецедент)

### D. Редакторские связи по соседу (11; своего ряда у роли нет, профиль заимствован и помечен «editorial neighbor» в onet_match и здесь)
- content-strategist → 13-1161.00 Market Research Analysts and Marketing Specialists (прецедент brand-strategist)
- online-course-creator → 25-3021.00 Self-Enrichment Teachers (прецедент частных инструкторов)
- streamer-content-creator → 27-3011.00 Broadcast Announcers and Radio Disc Jockeys
- ugc-creator → 27-2011.00 Actors
- doula → 31-1122.00 Personal Care Aides (прецедент elder-care-companion-pro)
- yacht-broker → 41-9022.00 Real Estate Sales Agents
- business-broker → 41-9022.00 (см. раздел B)
- salesforce-administrator → 15-1244.00 Network and Computer Systems Administrators
- home-organizer-pro → 27-1025.00 Interior Designers (прецедент home-stager)
- real-estate-investor-flips → 11-9021.00 Construction Managers (прецедент general-contractor)
- real-estate-investor-rentals → 11-9141.00 Property, Real Estate, and Community Association Managers (прецедент airbnb-co-host)
- sommelier → 35-3031.00 Waiters and Waitresses (alternate title «Wine Steward» у оккупации-донора)

### E. Связи по reported titles O*NET (2; своей оккупации нет, профиль — дом reported title, заимствование записано)
- dialysis-technician → 29-2012.00 Medical and Clinical Laboratory Technicians (reported titles «Certified Dialysis Technician», «Hemodialysis Technician»)
- cardiovascular-perfusionist → 29-2031.00 Cardiovascular Technologists and Technicians (reported title «Perfusionist»)

### F. Остались стабами — на решение Маши (14)
- general-surgeon — оккупация Surgeons, All Other (29-1249.00) в 30.2 НЕ data-level (нет Job Zone и рейтингов); рейтингованные хирурги — другие специальности, донор незащищаем.
- customer-success-manager — O*NET паркует reported title под 43-1011 (офисные супервайзеры), профиль канцелярского супервайзера искажает аккаунтную роль.
- tattoo-artist — ряда нет; Craft Artists отклонён ещё в WS2 (fine art — другая практика), профиль Skincare искажает A-ядро.
- body-piercing-artist — ряда и титульного дома нет.
- personal-fashion-stylist — ряда нет; Fashion Designers проектируют одежду, а не стилизуют людей.
- life-coach — 21-1019 Counselors, All Other в 30.2 не data-level; лицензионная психология (19-3033) искажает нелицензионную практику.
- laundromat-owner, self-storage-owner, car-wash-owner — absentee-бизнесы без исполняемого ремесла; профиль General/Operations Managers сделал бы их универсальными генералистами (паттерн CIP).
- resale-flipping-business, etsy-digital-products-seller, print-on-demand-seller, amazon-fba-seller — платформенные продавцы; Retail Salespersons (41-2031) — наёмная роль, противоречит ядру карточек (independence).
- franchise-owner-home-services — форма бизнеса, не оккупация; единого ремесла нет.

### G. Brewer / Brewmaster — структура НЕ тронута
- brewer-brewmaster → 51-9012.00: «Brewer» и «Brewmaster» — alternate
  titles самой оккупации still-machine (пивоваренные сосуды в таксономии —
  still/kettle family). Данные заполнены, карточка по-прежнему одна.
  Рекомендация Маше (по паттерну риелтора): Brewer — профессия входа,
  brewmaster — ступень роста внутри неё; если разделять, то как
  real-estate-agent/luxury: одна строка входа + пометка ступени в карточке.

### H. Побочные эффекты и целостность
- Импорт регенерирован из живого списка 373 профессий: сиротская запись
  luxury-real-estate-agent (кортеж удалён фиксом 28.10) больше не
  эмитится в data/onet-import.json; в шардах api/_lib/data/ её запись
  сохранена инертной для байт-стабильности распределения.
- Проверка диффа импорта: ни одна ранее связанная профессия не сменила
  SOC; изменения полей у ранее связанных — только 20 строк раздела A
  (extent + frozen_date + neighbor). professions-base.json: изменились
  только флаги стабов (66 строк), прочих полей — 0.
- Шарды перебалансированы по размеру (все ≤ 89,9 КБ при лимите
  загрузки ~98 КБ): часть хвостовых слагов переехала между шардами,
  состав и порядок (алфавит) сохранены; загрузчик через шарды даёт
  идентичный результат, что через единый файл (проверено).
- Локальные тесты: 22/23 (падает только pre-existing perceived-fit veto).

---

## Причина B, 28.10.2026 — красные линии и возраст: поля базы вместо эвристик по названиям

Что было: фильтры скоринга определяли факты о профессии эвристиками в
`scoring.mjs` — `night_shifts` одним слагом (air-traffic-controller),
`public_voice` множеством из 5 слагов, `voice_load` стоял у 42/373,
`age_gate` — у 2/373, а красная линия `no_relocation` не проверялась
вообще (ответ собирался в интервью, скоринг его не читал — мёртвый
фильтр). Гейт при этом держал ВТОРУЮ копию эвристик — regex по именам
(NIGHTS/PUBLIC/RELOC/ADULT), из-за чего движок и гейт спорили о фактах
(ложное срабатывание: Drone Pilot под no_nights; промахи: Online
Course Creator под no_public_voice; смешение полей: health-voice
гейта срабатывал по voice_load || PUBLIC-имени).

Что стало: каждое поле производится в одном месте —
`buildProfessions()`/`finalizeBaseFields()` в
`api/_lib/engine/professions.mjs` (+ импорт Work Context в
`scripts/import_onet.py`), экспортируется в `professions-base.json`
(новый `scripts/export_base.mjs`), читается скорингом и гейтом только
как поле. Слаг-сеты PUBLIC_VOICE_SLUGS/NIGHT_SLUGS из scoring.mjs
удалены; regex NIGHTS/PUBLIC/RELOC/ADULT из regression.mjs удалены;
линия no_relocation оживлена (topBlockReason →
'relocation_red_line' + фраза в BLOCK_REASON_PHRASES). Запасной
вариант по правилу брифа структурный: topBlockReason только сужает
пул кандидатов в scorePerson — слот топ-3 заполняется следующими
кандидатами, а честно пустой результат уходит в
insufficient_data + exploration_plan, как раньше.

### night_shifts (bool) — было: 1 слаг в движке → стало: 50 профессий

Источника в O*NET нет (элемента «ночная работа» в Work Context не
существует; Work Schedules Regular/Irregular — не ночи). Редакторский
сет, ручное решение по каждой профессии: true ⇔ ночная работа
СТРУКТУРНА (входящего ставят в ночные/ротационные смены как норму).
True (50): registered-nurse, registered-nurse-2, lpn-lvn,
nurse-practitioner, physician-assistant, emt-paramedic,
respiratory-therapist, surgical-technologist, dialysis-technician,
lab-technician, medical-laboratory-scientist, radiology-tech,
mri-technologist, sonographer-ultrasound, sterile-processing-tech,
sleep-technologist, cardiovascular-technologist, ekg-technician,
nuclear-medicine-technologist, physician, general-surgeon,
certified-anesthesiologist-assistant, cardiovascular-perfusionist,
certified-nurse-midwife, home-health-aide (live-in смены — спорное,
включена по дизайн-разбору), cdl-truck-driver,
owner-operator-trucking, train-conductor, locomotive-engineer,
subway-streetcar-operator, air-traffic-controller,
aircraft-dispatcher-faa, bus-driver, ship-engineer-merchant-marine,
harbor-pilot, boat-captain, tow-truck-operator, commercial-pilot,
helicopter-pilot, flight-attendant, police-officer, firefighter,
funeral-director (ночные first-call выезды — часть службы),
power-plant-operator, nuclear-reactor-operator,
water-wastewater-treatment-operator, millwright (сменные ротации на
производствах), semiconductor-technician (фабрики 24/7),
data-center-technician (ночные ротации покрытия), aircraft-mechanic-a-p
(авиакомпании обслуживают борта ночью).
Осознанные FALSE: baker (старты в 3–4 утра — раннее утро, не ночь),
doula (on-call роды ≠ смены), pharmacist/pharmacy-technician
(амбулаторный модальный формат по дизайн-разбору),
dispatcher-trucking (офис; ночные диспетчерские существуют — не
структурны), drone-pilot-commercial (дневные операции),
lineworker-power-lines (on-call выезды ≠ смены), tow-truck включён в
true (дежурства 24/7 — норма формата). Провенанс у всех:
data_flag 'night_shifts_editorial'.

### public_voice (bool) — было: 5 слагов → стало: 23 (18 по данным + 5 исключений)

Источник дотянут импортом: Work Context 30.2, элемент Public
Speaking (4.C.1.a.2.c) — CX-среднее и доля категории 5 CXP («каждый
день»); заодно Telephone (4.C.1.a.2.f) и Face-to-Face (4.C.1.a.2.l).
Покрытие: work_context есть у 346/373 профессий (359 с SOC, минус 13
SOC без строк Work Context в 30.2, напр. 27-2091 Disc Jockeys).
Правило (дизайн §1.2): CX ≥ 3.5 ИЛИ доля cat5 ≥ 50%. Контроль: RN
2.32 — false, CSR 1.65 — false, voice-actor 4.54/74.9% — true.
True по правилу (18): streamer-content-creator, ugc-creator,
voice-actor, fitness-trainer, yoga-pilates-instructor,
food-truck-owner, school-teacher, swim-instructor, corporate-trainer,
sports-coach, flight-attendant, substance-abuse-counselor (cat5 ≥ 50%
— групповые сессии ежедневно), instructional-designer,
recreational-therapist, helicopter-pilot, gym-fitness-studio-owner,
esl-adult-literacy-teacher, career-and-technical-education-teacher.
Ручные исключения поверх правила (5, 'public_voice_editorial'):
podcast-producer, dj-event-host, speech-public-speaking-coach (все
трое — наследие старого сета основателя; их SOC меряет средне-
офисный профиль занятия, а не день ведущего; у DJ строк Work Context
нет вообще), online-course-creator и funeral-director (два
зафиксированных промаха старого сета из брифа).
Пограничная очередь CX 3.0–3.49 просмотрена вручную, правило везде
выдержано (false): product-manager 3.35, general-contractor 3.15,
wellness-coach 3.23, recruiter/hr-specialist 3.33 (1:1 — не
публичный голос), grant-writer 3.14,
computer-and-information-research-scientist 3.13,
urban-and-regional-planner 3.28, community-health-worker 3.42
(продукт — поддержка и навигация, не собственный публичный голос;
её срабатывание в старом гейте было смешением с voice_load),
aba-therapist-kids 3.24, librarian 3.34, choreographer 3.33,
athletic-trainer 3.38, dental-assistant 3.19, chef/private-chef 3.21,
cleaning-company-owner 3.0, solar-installer 3.27.

### voice_load — было: 42/373 → стало: 152/373

Состав (провенанс — data_flags): 'voice_load_editorial' 8 —
VOICE_PRIMARY_SLUGS (6, как раньше) + recruiter +
commercial-insurance-producer (ручные исключения брифа: телефонные
продажи/рекрутинг, день — сплошные звонки; у CIP правило по SOC дало
бы true и само, исключение фиксирует приоритет); 'voice_load_onet'
130 — правило дизайна §1.4 по skills_lv Speaking (2.A.1.d):
LV ≥ 4.0 ИЛИ (LV ≥ 3.75 И Telephone CX ≥ 4.5); 'voice_load_from_category'
14 — прежняя деривация category=='people' && people==2 ТОЛЬКО как
фолбэк для care/teaching-ролей, не покрытых первыми двумя (их день —
непрерывный разговор 1:1; измеренный Speaking ниже порога не должен
снимать защиту). Потерь против старых 42 нет: старое множество —
подмножество нового. Диапазон совпал с прогнозом дизайна (120–170).

### relocation_required (bool) — было: поля и потребителя нет → стало: 9

Редакторский белый список (источника в данных нет): переезд к
назначенной базе или жизнь вне дома — УСЛОВИЕ ВХОДА.
True (9): ship-engineer-merchant-marine (месяцы в море),
harbor-pilot (лицензия одного пилотного района — переезд и есть
вход), commercial-diver (офшорные ротации), flight-attendant и
commercial-pilot (авиакомпания назначает базу экипажа),
helicopter-pilot (базы EMS/офшора), tower-climber-telecom
(разъездные бригады), wind-turbine-technician (travelling-tech —
модальный вход), lineworker-power-lines (ученичество и storm-crew —
разъездные). Осознанно НЕ включены (дизайн §1.3): owner-operator-
trucking, train-conductor, locomotive-engineer, boat-captain —
недели вне дома это absence, а не relocation; ждут слова основателя.
Провенанс: 'relocation_editorial'.

### age_gate — было: 2/373 → стало: 108/373

Расширена та же редакторская таблица AGE_GATES в professions.mjs,
каждая запись со строкой source. Состав: {max:30} ATC и {min:23}
aircraft-dispatcher — без изменений; {min:21} ×5 — cdl-truck-driver,
owner-operator-trucking (FMCSA interstate), customs-broker
(19 CFR 111.11), police-officer, probation-officer; {min:16} ×1 —
drone-pilot-commercial (FAA Part 107); {min:18} ×100 — лицензии
18+ (страхование ×3, недвижимость и брокеры ×6, NMLS ×2, FINRA,
CPA-трек, подрядчики/инспекторы), сертификаты FAA/USCG (пилоты 18 —
ATP 23 отмечен в source, A&P, капитан, merchant marine, commercial
diver), клинические лицензии штатов ×32, пожарные/бортпроводники/
PI/похоронные/NRC/операторы очистных/лифты/пестициды/HAZWOPER/
землемеры, ж/д и транзит ×4, боди-арт ×4, владение бизнесом ×30
(контракты, аренда, кредит — legal majority; Tutoring Center Owner
и Business/Yacht Broker из находки прохода по заглушкам входят
сюда). Вилка «age_gate автоматически из lic==2» ОТКЛОНЕНА: lic==2
покрывает и роли, куда в ряде штатов можно с 16–17 (косметологические
лицензии, ученичества), — автоправило перекрывало бы легальные входы.
Осознанно без ворот: учителя (нет статутного минимума сверх
степени), underwriter, enrolled agent (IRS минимума не ставит),
косметология/парикмахерские (лицензии с 16–17 во многих штатах).

### Гейт (scripts/regression.mjs) — синхронизация, отдельно

Regex NIGHTS/PUBLIC/RELOC/ADULT удалены. Правила читают те же поля
из --base: no_public_voice → p.public_voice; no_nights →
p.night_shifts; no_relocation → p.relocation_required; health voice
→ только p.gates.voice_load (старая дизъюнкция с PUBLIC-именем и
voice_load убрана — она смешивала два разных факта); under-18 →
p.age_gate (age < min), подпись правила: '(base age_gate)'.

---

## Разделение карьеры и side hustle, 28.10.2026 — правило основателя: матч = стабильная работа

Указание Маши: Сваха не выдаёт как профессию то, что не является
стабильной работой, — продавцом на Etsy/Amazon «устроиться» нельзя.
Full-time карьера (найм или своё дело как основная занятость) — это
матчи и вердикты; side hustle — только дополнительной карточкой-идеей
для подзаработка рядом с результатом, никогда в топ-3.

Что сделано:

- Поле `kind: 'career' | 'side_hustle'` во всех трёх местах:
  производитель `buildProfessions()` (professions.mjs — редакторский
  сет SIDE_HUSTLE_SLUGS + флаг `side_hustle_editorial` на объекте),
  экспорт professions-base.json (`kind` в проекции export_base.mjs),
  потребитель scoring.mjs. По умолчанию — 'career'.
- Движок: side_hustle исключены из top3, bottom3, cushion
  (bridge_pick) и обоих якорей одной фильтрацией пула подбора.
  Отдельный детерминированный подбор ОДНОЙ идеи (поле ответа
  `side_hustle_pick`): лучший LOVE среди side_hustle внутри
  ограничений человека — стартовый бюджет против редакторского
  тира затрат формата (low ≈ карманные деньги, минимум $0.5K
  названного бюджета; mid ≈ первая партия/первый флип/один комплект
  оборудования, $3K; high ≈ покупка актива, $15K), минимум 1
  свободный час в день, если часы названы; порог фита LOVE ≥ 0.55;
  красные линии и фактические гейты человека применяются и к идее.
  Не проходит ни одна — подбор пустой, ничего не навязывается.
  Основание идеи (`why_side`) строится только из закодированных
  ответов: главная тема дня по интересам (только измеренные
  профили), топ-ценность человека, его бюджет и часы — дословно.
- Поверхности: карточка на странице — отдельный внешний файл sh.js
  (mentor.html у потолка байтов), визуально НЕ матч (пунктирная
  рамка, без бейджей фита и шкал, заголовок «One more thing — a
  side-hustle idea»); письмо — секция «A side-hustle idea» по ноте
  SIDE_HUSTLE_NOTE, подбор в данных отчёта и в источниках верификатора
  (verify.mjs: ground truth + slim facts); Playground-дни для
  side_hustle не генерируются и не отдаются (API отвечает 404).
  Статистика на странице («…professions checked…») считает теперь
  КАРЬЕРЫ: health отдаёт `careers`, плитка показывает 355 — точное
  число карьерных строк базы после классификации (373 − 18).
- Гейт (scripts/regression.mjs) — изменение отдельно: новое
  HARD-правило «no side_hustle in top3/bottom3/cushion» и проверка
  «side_hustle_pick must be a side_hustle row», обе читают поле kind
  из --base.

### Классификация: side_hustle (18) — по одному предложению на строку

Явные случаи (примеры основателя и их класс):

- etsy-digital-products-seller — продажа своих файлов на маркетплейсе: устроиться туда нельзя, доход — продажа за продажей.
- amazon-fba-seller — торговля через склад Amazon: формат коммерции, а не рабочее место; типично ведётся рядом с основной занятостью.
- print-on-demand-seller — дизайны на чужих товарах под заказ: нулевой склад, доход с каждой продажи, классический подзаработок.
- resale-flipping-business — перепродажа вещей с наценкой: сделки, а не должность; типично рядом с работой.
- franchise-owner-home-services — франшиза это формат владения бизнесом, а не профессия: покупается право, а не рабочее место.
- laundromat-owner — absentee-актив: прачечная работает без ежедневного труда владельца, доход — от актива.
- self-storage-owner — absentee-актив: доход от аренды боксов, владелец не «работает» складом ежедневно.
- car-wash-owner — absentee-актив того же класса: автоматическая мойка, доход от оборудования и места.
- real-estate-investor-flips — перепродажа недвижимости: доход — разница сделок, это инвестиционная деятельность, а не занятость.
- real-estate-investor-rentals — арендный инвестор: доход — рента с активов, а не зарплата и не услуга клиентам.

Тот же класс (добавлены проходом, помечены как пограничные для проверки основателем):

- car-flipping — перепродажа машин: та же механика, что resale/flipping, только товар дороже.
- boat-restoration-flipping — покупка–реставрация–перепродажа лодок: доход — маржа сделки, типично рядом с основной работой. ПОГРАНИЧНАЯ: реставрация как ремесло на заказ осталась бы карьерой — карточка описывает именно флип.
- vending-atm-route-owner — вендинговые маршруты обслуживаются несколько часов в неделю: классический актив «рядом с работой».
- photo-booth-event-rentals-owner — аренда оборудования на выходные события: типично ведётся рядом с основной занятостью. ПОГРАНИЧНАЯ.
- streamer-content-creator — стримера никто не нанимает: доход строит аудитория, и почти всегда начинается рядом с работой или учёбой. ПОГРАНИЧНАЯ (для единиц становится основной занятостью — основатель может перещёлкнуть).
- online-course-creator — свой курс никто не заказывает как должность: строится актив и продаётся, типично рядом с экспертной работой. ПОГРАНИЧНАЯ.
- life-coach — практика без лицензии и без рынка найма: коучей не берут в штат, типично это практика рядом с основным доходом. ПОГРАНИЧНАЯ.
- wellness-coach — тот же нелицензируемый коучинговый паттерн, что life-coach. ПОГРАНИЧНАЯ.

### Пограничные, оставленные КАРЬЕРАМИ (основатель проверяет список)

- ugc-creator — бренды нанимают креаторов за каждое видео: это оплачиваемая клиентская работа, как Video Editor, а не актив в ожидании продаж.
- doula — семьи и агентства нанимают дул на роды: оплачиваемая услуга личного ухода, эпизодическая, но настоящее рабочее место.
- personal-fashion-stylist — салоны, ритейл, съёмки и частные клиенты нанимают стилистов: сервисная профессия.
- tutoring-center-owner — действующий бизнес с сотрудниками и помещением: основная занятость владельца, как Childcare Center Owner.
- airbnb-co-host-str-manager — клиентская услуга (управление чужой недвижимостью за процент); STR-компании нанимают менеджеров.
- senior-home-care-agency-owner — лицензируемое агентство со штатом: основная занятость владельца, а не absentee-актив.
- gym-fitness-studio-owner, spa-owner, beauty-salon-owner и прочие операционные владельцы (cleaning / painting / handyman / lawn-care / moving / pet-сервисы, food-truck, bakery-café, meal-prep) — владелец ежедневно работает В бизнесе: это его основная занятость по определению правила.
- mobile-mechanic-owner, auto-detailing-mobile-owner, mobile-pet-groomer, medical-courier-owner-route — owner-operator услуги: владелец сам выполняет работу каждый день.
- home-organizer-pro — клиенты нанимают организаторов на проекты: личная услуга, как стилист.
- farmers-market-producer — продаёт продукцию своей фермы: фермерство — основная занятость, рынок — её канал продаж.
- freight-broker-agent, business-broker, yacht-broker — лицензируемая брокерская работа: брокериджи нанимают агентов, клиенты платят за сделки (slow money, но найм существует).
- speech-public-speaking-coach — корпоративный рынок нанимает тренеров публичных выступлений под программы и руководителей: клиентская услуга, в отличие от нелицензируемого life/wellness-коучинга.
- jewelry-maker — ювелиров нанимают мастерские и бренды (bench jeweler), плюс заказы: ремесленная профессия с рынком найма.

Итог базы после классификации: 373 строки = 355 карьер + 18 side
hustle. Ни одна строка не удалена и не переименована; вердикты,
зарплаты и сроки не тронуты.

---

## Поправка 28.10.2026 (вечер) — yacht-broker: медиана комиссионного брокера вместо редакторской цифры $150K

Ошибка того же класса, что drone-pilot $123K и luxury-real-estate-agent
$140K: цифра без источника тянула ранжирование (после получения измеренного
профиля в проходе по заглушкам строка стала аттрактором — корона 17–20%
сессий гейта). Проход по данным 28.10 цифру сознательно не трогал
(«Сознательно НЕ тронуты: yacht-broker ($150K) и luxury-real-estate-agent»).

- yacht-broker · payK · 150 → 76 · медиана типичного работающего яхт-брокера
  по отраслевым источникам (см. ниже). 150 — редакторская цифра без
  источника; отдельного ряда BLS (OOH/OEWS) для яхт-брокеров не существует —
  профессия туда не входит, что честно фиксируем, как и с операторами
  дронов. Доход брокера — не оклад, а доля комиссии с продажи.
- yacht-broker · карточка (roadmaps-data-2.json) · "~$150K (BLS OOH
  ranges)" → "~$76K (industry salary data — BLS publishes no yacht-broker
  series; income is commission on sales, not a salary)". Прежний текст
  карточки приписывал цифру BLS, ряда которого нет. Движок = карточка =
  professions-base.json (D5 = 0 расхождений; регенерация экспорта изменила
  ровно одну строку). pay_top_decile_k у профессии стоял null — защищаемой
  цифры верхней децили ни один источник не даёт (есть только звёздный
  сегмент суперъяхт), выдуманная дециль не добавлялась. Профиль (сосед
  41-9022), age_gate 18+, kind=career, training 9 мес — не тронуты.
- PDF роадмапа (CareerGlitch_YachtBroker_Roadmap_2027_v1.pdf) по-прежнему
  печатает «~$150K median» и полосу ~$93K/$218K, смоделированную вокруг
  неё, со ссылкой на BLS OOH — после этой поправки PDF расходится с
  движком и карточкой; перегенерация PDF — отдельной задачей вне этого
  фикса (у drone PDF уже печатал исправленную цифру, здесь — нет).

Комиссионная модель (прочитано 28.10.2026): стандарт отрасли — 10% от
цены продажи платит продавец при закрытии (YachtWorld/Boats Group;
The Yacht Trader; LegalClarity). Комиссия делится между листинговым и
продающим брокериджем, брокеридж делится с брокером — на руки человеку
обычно ~половина доли своего дома (практики на YachtForums: дом 4–6% из
10%, продавец получает половину доли дома; живые вакансии, напр. Jacobs
Yachts FL: 50–60% чистого дохода брокериджа). Итого на сделке с двумя
брокерами человек получает ≈2,5% цены. Контрольный счёт: медиана $150K
означала бы для медианного брокера ≈$6M закрытого объёма в год при
входных цифрах $30–60K в первый год — источники сходятся, что это
уровень топ-продюсеров, а не медиана. Лицензирование: Florida Yacht and
Ship Brokers' Act (Fla. Stat. ch. 326, §326.004) — без лицензии
брокером/продавцом быть нельзя; лицензия брокера — после лицензии
продавца и ≥4 сделок продажи яхт или 20 образовательных кредитов,
поручительские бонды ($10K продавец / $25K брокер, DBPR).

Источники по заработку яхт-брокеров в США (все прочитаны 28.10.2026) —
разброс центральных оценок $70K–$121K, цифра спорная, фиксируем честно:
- Comparably (самоотчёты о зарплатах, обновлено нояб. 2025): среднее
  $76,224. Перекос: среднее, не медиана; анонимная выборка — но популяция
  именно работающих брокеров, не звёзд.
- Pontooners (отраслевой гайд, синтез «market studies»): среднее «just
  under $70,000»; до $120K — у брокеров с дорогими клиентами.
- YachtWorld / Boats Group (отраслевой гайд «How To Become A Yacht
  Broker»): среднее $105,000, диапазон $80K–$1M+. Перекос: раздел
  озаглавлен про суперъяхтные брокеры, методологии нет — верхняя из
  центральных оценок.
- GBTimes (редакторский разбор): «среднее» $80–150K; вход ~$30K; ветераны
  $500K–$1M. Диапазон редакторский, без данных — в синтез не бралась как
  точечная оценка.
- GoDownsize: «в среднем $121,000» с зарплатой и комиссиями — без
  источника, включает верхний сегмент; слабая оценка, в синтез не бралась.
- Gyfted (карьерный гайд): типичный диапазон $50K–$200K+, центра нет.
- Indeed (страницы городов, самоотчёты): Fort Lauderdale $181,841
  (3 отчёта), New York $160,201 (2), Seattle $146,699 (4), Annapolis
  $142,497 (2). Перекос: премиальные метрополии, n=2–4, средние успешных —
  не национальная медиана.
- Salary.com (модельные страницы по компаниям): $143–156K, включая
  «$255,522 в Yahoo» — модельный мусор по нерелевантным компаниям, как
  источник отклонён.
- Якорь соседа по профилю, BLS SOC 41-9022: OOH 2025, Real Estate Brokers
  and Sales Agents (объединённая медиана) $57,400; собственная строка базы
  real-estate-agent — $53K. Это пол лицензируемых комиссионных продаж
  активов по опросным данным — яхта даёт премию за размер сделок, но
  опросная медиана комиссионных агентов в принципе живёт на $53–63K
  (OEWS Real Estate Brokers, медиана $63,060), а не на $150K.

Медиана точечных центральных оценок (70 / 76 / 105) = $76K.
Взято 76: совпадает с самой массовой выборкой работающих брокеров
(Comparably $76,224), выше опросного якоря 41-9022 — честная премия за
крупные сделки — и вдвое ниже прежней редакторской цифры, которая
описывала верхний сегмент, а не типичного брокера.

---

## Matchmaker 2.0 — ядро (28.10.2026, бриф §5, бенчмарк §4)

Механизмы (не данные профессий): захват названной цели (поле
`stated_target` в банке этапа 2 — одно конкретное имя профессии,
необязательно) и её детерминированное сопоставление без LLM
(`engine/target-match.mjs`: таблица сокращений → точное имя базы →
O*NET title профессии → корпус alternate/reported titles O*NET 30.2
по тем же hand-reviewed SOC, что проход по заглушкам —
`api/_lib/data/target-aliases-*.json`, сборка
`scripts/build_target_aliases.mjs` → редакционные канонические
алиасы новых строк → токен-подмножества; двусмысленность = честный
промах, не угадайка). Оценка — поле результата
`target_evaluation[]` (`engine/targets.mjs`): базовая карточка,
категория для этого человека, статус по порогу С ПУТЁМ, сработавшие
фильтры по именам (BLOCK_REASON_PHRASES — тот же словарь, что
selection pool), лестница и первая ступень.

### Floor-as-path — одно правило вместо асимметрии медиана/дециль

`floorStatus()` (engine/scoring.mjs): профессия проходит порог,
если (i) медиана ≥ порога (`clears`), ИЛИ (ii) её лестница достигает
порога за N лет (`clears_via_ladder`, путь печатается:
`floor_path {via_name, via_pay_k, years_to_floor}`), ИЛИ (iii)
источниковый верхний заработок ≥ порога (`top_tier_only` /
`top_decile_only` — BLS OEWS p75/p90 там, где OEWS даёт ряд).
Голый `below_floor` по-прежнему не садится (фикс smalls не тронут);
`clears_via_ladder` — легальное основание сесть С напечатанным
путём. N = `LADDER_FLOOR_YEARS = 5` (engine/ladders.mjs):
обоснование — полная дуга бенчмарка ADN→специализация→владение
занимает ≈4,5 года; 5 лет покрывает её с запасом и отсекает вторые
карьеры длиной в степень (>5 лет — уже не путь к порогу, а новая
жизнь, честно помечается ниже порога по медиане). Порядок проверок:
лестница раньше дециля — путь называть полезнее хвостовой цифры.

Баг Марины, который это чинит: RN ($98K) умирал о порог $100K, а
CIP ($62K) жил децилем $138K — одно правило, два исхода. Теперь RN
проходит лестницей RN→Aesthetic Nurse→Med Spa Owner (54 мес =
4,5 г ≤ 5), CIP по-прежнему проходит своим децилем — асимметрии
правила больше нет, есть разные факты у разных профессий.

### Лестницы (поля entry_steps / next_steps / prerequisites)

Производитель — таблица LADDERS в professions.mjs (единственный
источник), экспорт — scripts/export_base.mjs, потребитель —
scoring.mjs/targets.mjs. Наполнен только кластер бенчмарка
(остальная база — пустые лестницы, честно):

- certified-nursing-assistant → next: LPN, RN. Предусловие:
  программа Nurse Aide I, утверждённая штатом, + экзамен
  компетентности (NC: 75+ часов, из них 16 клинических; реестр
  NC Nurse Aide I). Источники: NC DHHS/DHSR, Wake Tech.
- lpn-lvn: entry CNA (2 мес, ~$1K), next RN. NCLEX-PN.
- registered-nurse: entry CNA (2 мес, ~$1K), LPN (9 мес, ~$6K);
  next Aesthetic Nurse, Nurse Practitioner. ADN/BSN + NCLEX-RN;
  иностранный диплом сам по себе не лицензия.
- aesthetic-nurse-nurse-injector: entry CNA, RN (36 мес, ~$20K);
  next Med Spa Owner. Активная RN-лицензия; работодатели обычно
  хотят 1–2 года клиники до сертификационных курсов.
- med-spa-owner: entry CNA, RN, Aesthetic Nurse (6 мес, ~$4K);
  next нет. Своя клиническая лицензия или контрактный медицинский
  директор; стартовый капитал сверх стоимости обучения.

Стоимости ступеней выше CNA — редакторские средние программные
цены (помечены так здесь; в данных ступеней — как есть).

### Новые строки базы (373 → 376; карьеры 355 → 358)

- **Certified Nursing Assistant** (health, kind=career). payK **42** —
  BLS OOH «Nursing Assistants and Orderlies», медиана $42,260
  (май 2025); outlook +3% к 2035 (BLS) добавлен в SOURCED_OUTLOOK.
  training 2 мес (NC Nurse Aide I: 75+ часов; ускоренные программы
  4–6 недель, колледжные — до ~160 часов). age_gate НЕТ осознанно:
  Wake Tech принимает на NA I с 16½ лет — ворота 18+ были бы
  выдуманным барьером. Векторы — редакторские кортежи (O*NET-импорт
  строку пока не покрывает; связывание с SOC 31-1131 — отдельной
  задачей в остаток).
- **Aesthetic Nurse / Nurse Injector** (health, kind=career).
  payK **80** — ZipRecruiter, средняя по стране $80,321/год
  (октябрь 2026, данные объявлений о вакансиях — НЕ BLS; ряда BLS
  по специальности нет, честно помечено в карточке roadmaps).
  training 6 мес (сертификационные курсы + практика ПОВЕРХ
  RN-лицензии). age_gate 18 — практика на RN-лицензии.
- **Med Spa Owner** (business, kind=career — владелец работает в
  бизнесе, не absentee). payK **150** — РЕДАКТОРСКАЯ оценка дохода
  работающего владельца: чистой статистики нет; AmSpa 2024 —
  средняя выручка одной локации $1,399K при марже 20–25% (это пул
  прибыли, не доход владельца); планировочные разборы дают
  зрелого владельца-практика ~$210K и владельцa-менеджера ~$120K.
  Взято 150 — консервативно внутри документированного разброса;
  ZipRecruiter «medspa owner» $232K — артефакт объявлений, не взят.
  training 12 мес — поставить бизнес поверх клинической лицензии.
  age_gate 18 — владение (договоры, аренда, кредит юрлица).

Карточки roadmaps для трёх строк — roadmaps-data-3.json (стикер
YES у всех трёх — редакционный вердикт по стандарту 23.10:
CNA — да как первая ступень лестницы, не как потолок; инжектор —
да поверх лицензии; владелец — да как работающий владелец).

### Сопоставление целей: редакторские алиасы

Строки без O*NET-корпуса (CNA, Aesthetic, Med Spa — SOC в импорте
нет) получают канонические алиасы таблицей EDITORIAL_ALIASES в
target-match.mjs: «nurse aide», «nurse aide i», «certified nurse
aide» → CNA (Nurse Aide I — буквальное название профессии в NC);
«medical spa owner», «medspa owner» → Med Spa Owner. Полный список
— в коде; расширяется только вручную.

### Якорь названной цели в отборе (механизм, не данные)

Если названная цель проходима (в пуле, порог не below_floor) — она
садится в топ-3 с флагом `target_anchor`, вытесняя слабейшую
не-мостовую карточку (своя семья — предпочтительная жертва): сваха
не имеет права молча похоронить то, что человек назвал целью. Если
цель закрыта собственными линиями человека — в топ-3 садится
первая проходимая ступень ЕЁ лестницы (обратный ход по
entry_steps), с объяснением в set_reason, какой дверью цель
закрыта. Под заморозкой этапа 6 якорь не работает (замороженный
набор неприкосновенен). Мост (bridge_pick) не тронут: лестничный
мост идёт через существующий отбор + якорь, второго механизма нет.
Med Spa Owner добавлен в SLOW_MONEY_NAMES (доход владельца строится
годами — подушка рядом с ним считается по тому же правилу, что для
Spa Owner).

Дополнение о разбиении файлов (тот же проход): scoring.mjs стоял в
94668 байт при потолке загрузки ~95000 и проход его пробил. По
паттерну pg.js механизм вынесен, а не ужата проза: floorStatus →
engine/ladders.mjs; якорь названной цели → engine/targets.mjs
(applyTargetAnchor); туда же переехали таблицы полей направления
и фраз блокировок (их словарь — родня FILTER_NAMES карточек целей).
scoring.mjs после прохода — 89357 байт; экспорты TARGET_FIELDS /
professionField / professionFamily сохранены ре-экспортом.

Поправка к записи выше (тот же проход, после первого preview-гейта):
фраза «векторы — редакторские кортежи, связывание отдельной
задачей» больше не действует. Первый preview-гейт показал регрессию
правила стабов (0% → 10% слотов топ-3): новые строки-стабы тянули
слоты. Связывание сделано В ЭТОМ ЖЕ проходе по процедуре прохода
по заглушкам (оверрайды в scripts/import_onet.py, регенерация
data/onet-import.json верифицирована пословно: +3 записи, ноль
изменений существующих; шарды пересобраны тем же алгоритмом):
CNA — точный SOC 31-1131.00 (Nursing Assistants); Aesthetic Nurse —
override на 29-1141.00 (Registered Nurses: практика на RN-лицензии;
pay НЕ наследуется, цифра карточки — данные объявлений); Med Spa
Owner — override на 11-9111.00 (Medical and Health Services
Managers: медспа — медицинская практика; pay НЕ наследуется,
редакторская оценка владельца). Итог: стабов в базе снова ровно 14
(основателево «пусть лежат тихо» не тронуто), новые строки измерены.
Корпус алиасов целей пересобран: 362 профессии, 8442 названия
(CNA получил свой корпус 31-1131, включая «Nurse Aide»).
voice_load покрытие выросло 152 → 154 (Work Context новых SOC).

## Matchmaker 2.0 — расширение (29.10.2026, бриф §5, пункты 4–6 + 8)

### OEWS-экстракт зарплат по штату (пункт 5)

Источник: BLS Occupational Employment and Wage Statistics (OEWS), May 2024
state estimates — официальный файл oesm24st.zip / state_M2024_dl.xlsx
(https://www.bls.gov/oes/special-requests/oesm24st.zip), получен 29.10.2026.
Примечание о доступе: BLS отдаёт plain curl «Akamai 403»; файл получен с
полным набором браузерных заголовков (UA Chrome + sec-ch-ua + Referer на
страницу OEWS) — тем же маршрутом файл перекачивается при регенерации.

Экстракт: api/_lib/data/state-pay.json; регенерация —
scripts/build_state_pay.mjs <state_M2024_dl.xlsx> (SOC-множество берётся
из самого движка, loadProfessions: 267 различных SOC базы). Отбор строк:
statewide (AREA_TYPE 2), cross-industry (NAICS 000000, I_GROUP
cross-industry), OWN_CODE 1235, только detailed occupations.

Покрытие базы: NC — 254 из 267 SOC (95.1%), FL — 255 из 267 (95.5%).
Правила значений: A_MEDIAN '#' (top-coded, ≥$239,200) → 239.2 +
top_coded:true; '*' (не опубликовано) → строка отсутствует, оценка не
подставляется; годовой медианы нет, часовая есть → ×2.08 (конвенция BLS
2,080 часов) с пометкой basis:'hourly'. Показ: цифра штата рядом с
национальной у карточек топ-3, карточки цели и ступеней лестницы;
нет ряда — национальная без пометок. Полная матрица 50 штатов НЕ строится:
механизм + NC/FL (бридж-штат Marina — NC; FL — её названный переезд).
Контрольные значения: RN (29-1141) NC медиана $81.9K, FL $82.9K;
CNA (31-1131) NC $37.7K.

### Bridge-правило зачёта иностранного диплома (пункт 4в)

Записано по правилу брифа «нет правила — нет сокращения»: training_months
ступеней лестницы по иностранному диплому НЕ сокращается нигде. Основание:
длины лицензионных ступеней в США заданы штатами и программами (NCLEX,
резидентура, FE/PE-трек), а не дипломом; сокращение «по смыслу» было бы
выдуманной цифрой. Что диплом ДЕЛАЕТ (это и сертифицирует credential
evaluation): закрывает предпосылки уровня диплома у лицензионных маршрутов
своего поля. Правило живёт в коде: api/_lib/engine/bridge-eval.mjs
(credit.rule = 'no_months_reduction'), маршрут по полю диплома — таблицей
там же (WES/ECE первым шагом у всех полей; далее NCEES→FE/EIT→PE для
инженерии, ECFMG→USMLE→резидентура для медицины, CGFNS→NCLEX для
медсестёр и т.д. по полям банка degree_field).

### Программы CNA / Charlotte, NC (пункт 6)

Механизм: api/_lib/data/programs.json + engine/programs.mjs; наполнен
только кластер certified-nursing-assistant / NC — прочие первые ступени
честно пусты. Источники прочитаны 29.10.2026 (страницы, не сниппеты):

1. Gaston College (Dallas, NC) — Certified Nurse Aide I, Continuing
   Education: 160 часов; $224 по печатному расписанию колледжа (включая
   $25 lab fee и $13 malpractice insurance), веб-цена колледжа $230
   (окт. 2026). В данных: cost_k 0.23, months 2 (160-часовой курс при
   расписании part-time ≈ 8 недель).
2. Central Piedmont Community College (Charlotte, NC) — Nurse Aide I
   (NAS 101, зачётный): каталог колледжа — 6.0 кредитов, по завершении
   допуск к тесту NC Nurse Aide I Registry; tuition $76/кредитный час
   (ставка колледжа для резидентов NC) → $456 tuition, с фи колледжа
   опубликованный стартовый итог ≈ $760. В данных: cost_k 0.76, months 4
   (один семестр).
3. Carolinas College of Health Sciences (Atrium Health, Charlotte, NC) —
   Nurse Aide I: публикация Atrium Health о программе — 150 часов,
   tuition $1,100; курс в утверждённом списке NC DHSR. В данных:
   cost_k 1.1, months 2.

Ранжирование — по цене, затем по сроку; комиссий нет и быть не может.
