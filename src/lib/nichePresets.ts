import type { BookingStatus, ServiceItem, StoreConfig } from './types'

export interface NichePreset {
  group: 'beauty' | 'medical' | 'food' | 'home' | 'education' | 'auto'
  nicheNom: string          // Именительный: « барбершоп», «стоматология»
  nicheAcc: string          // Винительный (звоню в ...): «барбершоп», «стоматологию», «кафе»
  nicheGen: string          // Родительный (система для ...): «барбершопа», «стоматологии», «кафе»
  clientsLabel: string      // «клиентов», «пациентов», «гостей», «заказчиков»
  bookingTitle: string      // Заголовок модалки
  bookingBtnText: string    // Кнопка в Hero
  itemFieldLabel: string    // Поле 4 в форме записи
  itemFieldPlaceholder: string
  itemSummaryLabel: string  // Подпись в карточке созданной заявки
  resourceHoursLabel: string
  crmInWorkLabel: string
  crmAddBtnLabel: string
  lineLabels: [string, string, string]
  statusLabels: Record<Exclude<BookingStatus, 'cancelled'>, string>
  defaultServices: ServiceItem[]
}

const BEAUTY_SERVICES: ServiceItem[] = [
  { id: 'b1', category: 'Популярное', name: 'Комплексный уход / Топ-услуга мастера', price: 7000, duration: 60, desc: 'Индивидуальный подбор, консультация специалиста и премиум-материалы' },
  { id: 'b2', category: 'Основное', name: 'Базовая процедура / Стрижка / Маникюр', price: 5000, duration: 45, desc: 'Аккуратное выполнение с гарантией чистоты и стерильности инструмента' },
  { id: 'b3', category: 'Премиум', name: 'VIP-комплекс в 4 руки / Полное обновление', price: 12000, duration: 90, desc: 'Максимальная экономия времени и комплексный уход за один визит' },
  { id: 'b4', category: 'Уход', name: 'Восстанавливающая и спа-процедура', price: 6500, duration: 60, desc: 'Профессиональная косметика и бережное восстановление' },
  { id: 'b5', category: 'Экспресс', name: 'Экспресс-услуга / Коррекция и укладка', price: 3500, duration: 30, desc: 'Быстрое преображение перед важным событием или встречей' },
]

const BARBER_SERVICES: ServiceItem[] = [
  { id: 'br1', category: 'Стрижки', name: 'Мужская стрижка (Топ-барбер)', price: 5000, duration: 45, desc: 'Мытьё головы, подбор формы, фейд и укладка премиальным стайлингом' },
  { id: 'br2', category: 'Комплекс', name: 'Стрижка + моделирование бороды', price: 7500, duration: 60, desc: 'Полный комплекс с распариванием горячим полотенцем и опасной бритвой' },
  { id: 'br3', category: 'Борода', name: 'Оформление и коррекция бороды', price: 3500, duration: 30, desc: 'Чёткие контуры, шейвер, бритва и уходовое масло для бороды' },
  { id: 'br4', category: 'Детская', name: 'Детская стрижка (до 12 лет)', price: 4000, duration: 40, desc: 'Комфортная атмосфера и стильная стрижка для юных гостей' },
  { id: 'br5', category: 'Уход', name: 'Чистка лица Black Mask + массаж головы', price: 4500, duration: 30, desc: 'Глубокое очищение пор и освежающий тонизирующий уход' },
]

const NAIL_SERVICES: ServiceItem[] = [
  { id: 'nl1', category: 'Маникюр', name: 'Маникюр с укреплением и покрытием гель-лак', price: 7000, duration: 90, desc: 'Снятие, чистый комбинированный маникюр, выравнивание и однотонное покрытие' },
  { id: 'nl2', category: 'Педикюр', name: 'Полный SMART-педикюр с покрытием', price: 9000, duration: 90, desc: 'Обработка стоп дисками, уход за кутикулой и стойкое покрытие' },
  { id: 'nl3', category: 'Наращивание', name: 'Наращивание ногтей и дизайн', price: 11000, duration: 120, desc: 'Моделирование длины и архитектуры, френч или трендовый дизайн' },
  { id: 'nl4', category: 'Уход', name: 'Гигиенический маникюр + SPA-уход', price: 4500, duration: 45, desc: 'Бережная обработка без покрытия, скрабирование и увлажнение кожи рук' },
]

const MEDICAL_SERVICES: ServiceItem[] = [
  { id: 'm1', category: 'Консультация', name: 'Первичный приём и комплексная диагностика', price: 5000, duration: 30, desc: 'Осмотр профильного специалиста, составление детального плана лечения и сметы' },
  { id: 'm2', category: 'Профилактика', name: 'Профессиональная чистка и профилактика', price: 15000, duration: 45, desc: 'Современное безболезненное оборудование и бережная обработка' },
  { id: 'm3', category: 'Лечение', name: 'Терапевтическое лечение (под ключ)', price: 18000, duration: 60, desc: 'Безопасная анестезия, сертифицированные материалы и гарантия качества' },
  { id: 'm4', category: 'Эстетика', name: 'Эстетическая реставрация и восстановление', price: 25000, duration: 60, desc: 'Высокоточное восстановление с контролем результата' },
]

const FOOD_SERVICES: ServiceItem[] = [
  { id: 'f1', category: 'Бронь стола', name: 'Бронь столика на 2–4 персоны (основной зал)', price: 5000, duration: 90, desc: 'Депозит полностью входит в счёт заказа по основному меню и барной карте' },
  { id: 'f2', category: 'Компания', name: 'Бронь большого стола / Кабинки (6–10 гостей)', price: 15000, duration: 120, desc: 'Уютная зона для встречи с друзьями, семейного ужина или дня рождения' },
  { id: 'f3', category: 'Сет / Заказ', name: 'Предзаказ фирменного сета к вашему приходу', price: 12000, duration: 45, desc: 'Горячие блюда и напитки будут накрыты точно к выбранному времени без ожидания' },
  { id: 'f4', category: 'Самовывоз / Доставка', name: 'Сбор заказа с собой ко времени', price: 4500, duration: 30, desc: 'Оформите предзаказ онлайн и заберите готовый горячий заказ без очереди на кассе' },
]

const HOME_SERVICES: ServiceItem[] = [
  { id: 'h1', category: 'Замер и смета', name: 'Выезд специалиста, точный замер и расчёт сметы', price: 3000, duration: 60, desc: 'При выезде с каталогом образцов и заключении договора стоимость замера 0 ₸' },
  { id: 'h2', category: 'Стандарт', name: 'Комплексное выполнение работ (1 комната / зона)', price: 35000, duration: 120, desc: 'Чистый монтаж по договору с гарантией на материалы и работу' },
  { id: 'h3', category: 'Под ключ', name: 'Полный пакет «Под ключ» (квартира / дом)', price: 95000, duration: 180, desc: 'Фиксированная смета, соблюдение сроков и поэтапный контроль качества' },
  { id: 'h4', category: 'Сервис', name: 'Срочный выезд мастера и мелкий ремонт', price: 8000, duration: 60, desc: 'Оперативное устранение неисправностей в день обращения' },
]

const CLEANING_SERVICES: ServiceItem[] = [
  { id: 'cl1', category: 'Уборка', name: 'Генеральная уборка квартиры / дома', price: 20000, duration: 180, desc: 'Профессиональная химия, мытьё всех поверхностей, кухни и санузлов' },
  { id: 'cl2', category: 'После ремонта', name: 'Уборка после ремонта и строительства', price: 35000, duration: 240, desc: 'Удаление строительной пыли, следов краски, цемента и мойка окон' },
  { id: 'cl3', category: 'Химчистка', name: 'Химчистка мягкой мебели и ковров', price: 12000, duration: 90, desc: 'Глубокая экстракторная чистка диванов, матрасов и ковровых покрытий' },
  { id: 'cl4', category: 'Поддерживающая', name: 'Стандартная поддерживающая уборка', price: 12000, duration: 120, desc: 'Быстрое наведение идеальной чистоты и свежести в удобное время' },
]

const EDUCATION_SERVICES: ServiceItem[] = [
  { id: 'ed1', category: 'Пробное', name: 'Пробное занятие и диагностика уровня', price: 3000, duration: 60, desc: 'Знакомство с преподавателем/тренером и составление индивидуальной программы' },
  { id: 'ed2', category: 'Абонемент', name: 'Абонемент на месяц (8–12 посещений)', price: 25000, duration: 60, desc: 'Системные занятия в мини-группе в удобные дни недели' },
  { id: 'ed3', category: 'Индивидуально', name: 'Персональное занятие 1-на-1', price: 6000, duration: 60, desc: 'Максимальный фокус внимания специалиста на вашей цели и результате' },
]

const CARWASH_SERVICES: ServiceItem[] = [
  { id: 'cw1', category: 'Комплекс', name: 'Комплексная мойка (Кузов + Салон + Багажник)', price: 4500, duration: 45, desc: 'Бесконтактная трехфазная мойка, уборка салона пылесосом, чернение резины' },
  { id: 'cw2', category: 'Кузов', name: 'Экспресс-мойка кузова с пеной и сушкой', price: 2500, duration: 30, desc: 'Быстрая бережная мойка без очереди по предварительной записи' },
  { id: 'cw3', category: 'Детейлинг', name: 'Детейлинг-мойка и кварцевое покрытие кузова', price: 8500, duration: 60, desc: 'Глубокая очистка труднодоступных мест, гидрофобный блеск и защита ЛКП' },
  { id: 'cw4', category: 'Химчистка', name: 'Химчистка салона и озонация автомобиля', price: 25000, duration: 180, desc: 'Удаление пятен и запахов, чистка кожи и текстиля профессиональным составом' },
]

export function getNichePreset(cfg: StoreConfig): NichePreset {
  const hay = `${cfg.category || ''} ${cfg.subtitle || ''} ${(cfg.rubrics || []).join(' ')} ${cfg.name}`.toLowerCase()

  if (
    cfg.slug === 'marsagi' ||
    hay.includes('автосервис') ||
    hay.includes('авто') ||
    hay.includes('сто') ||
    hay.includes('шиномонтаж') ||
    hay.includes('детейлинг') ||
    hay.includes('подвеск') ||
    hay.includes('двигател') ||
    hay.includes('машин')
  ) {
    return {
      group: 'auto',
      nicheNom: 'Автосервис',
      nicheAcc: 'автосервис',
      nicheGen: 'автосервиса',
      clientsLabel: 'автовладельцев',
      bookingTitle: 'Запись в автосервис',
      bookingBtnText: 'Записаться онлайн',
      itemFieldLabel: '4. Данные автомобиля и контакт',
      itemFieldPlaceholder: 'Марка, модель и год (например: Toyota Camry 70, Zeekr 001)',
      itemSummaryLabel: 'Автомобиль',
      resourceHoursLabel: 'Часы приёма боксов',
      crmInWorkLabel: 'В боксах сейчас',
      crmAddBtnLabel: 'Добавить в расписание боксов',
      lineLabels: [
        'Линия 1 · Главный приёмщик / Запись',
        'Линия 2 · Мастер цеха / Консультация',
        'Линия 3 · Детейлинг и подбор запчастей',
      ],
      statusLabels: {
        new: 'Новая заявка',
        confirmed: 'Ожидаем в боксе',
        in_repair: 'В работе (бокс)',
        ready: 'Машина готова!',
        done: 'Выдано клиенту',
      },
      defaultServices: cfg.services || [],
    }
  }

  if (hay.includes('барбер') || hay.includes('barber')) {
    return {
      group: 'beauty',
      nicheNom: 'Барбершоп',
      nicheAcc: 'барбершоп',
      nicheGen: 'барбершопа',
      clientsLabel: 'гостей',
      bookingTitle: 'Онлайн-запись к барберу',
      bookingBtnText: 'Записаться на стрижку',
      itemFieldLabel: '4. Пожелания или имя барбера',
      itemFieldPlaceholder: 'Например: Стрижка фейд + борода, к старшему мастеру',
      itemSummaryLabel: 'Пожелания',
      resourceHoursLabel: 'Часы работы мастеров',
      crmInWorkLabel: 'В креслах сейчас',
      crmAddBtnLabel: 'Добавить в расписание мастеров',
      lineLabels: [
        'Линия 1 · Администратор / Запись',
        'Линия 2 · Старший барбер',
        'Линия 3 · VIP-зал и консультация',
      ],
      statusLabels: {
        new: 'Новая запись',
        confirmed: 'Подтверждена',
        in_repair: 'В кресле у мастера',
        ready: 'Завершается',
        done: 'Визит выполнен',
      },
      defaultServices: BARBER_SERVICES,
    }
  }

  if (hay.includes('маникюр') || hay.includes('педикюр') || hay.includes('ногт') || hay.includes('nail')) {
    return {
      group: 'beauty',
      nicheNom: 'Студия маникюра',
      nicheAcc: 'студию маникюра',
      nicheGen: 'студии маникюра',
      clientsLabel: 'клиенток',
      bookingTitle: 'Онлайн-запись к мастеру',
      bookingBtnText: 'Записаться к мастеру',
      itemFieldLabel: '4. Пожелания по покрытию / мастеру',
      itemFieldPlaceholder: 'Например: Снятие + однотонное покрытие гель-лак',
      itemSummaryLabel: 'Пожелания',
      resourceHoursLabel: 'Часы приёма мастеров',
      crmInWorkLabel: 'На процедуре сейчас',
      crmAddBtnLabel: 'Добавить запись к мастеру',
      lineLabels: [
        'Линия 1 · Администратор студии',
        'Линия 2 · Топ-мастер маникюра',
        'Линия 3 · Запись на педикюр и ресницы',
      ],
      statusLabels: {
        new: 'Новая запись',
        confirmed: 'Подтверждена',
        in_repair: 'На процедуре',
        ready: 'Готово',
        done: 'Визит завершён',
      },
      defaultServices: NAIL_SERVICES,
    }
  }

  if (
    hay.includes('салон красоты') ||
    hay.includes('парикмахер') ||
    hay.includes('массаж') ||
    hay.includes('косметолог') ||
    hay.includes('спа') ||
    hay.includes('груминг')
  ) {
    return {
      group: 'beauty',
      nicheNom: hay.includes('груминг') ? 'Груминг-салон' : hay.includes('массаж') ? 'Студия массажа' : 'Салон красоты',
      nicheAcc: hay.includes('груминг') ? 'груминг-салон' : hay.includes('массаж') ? 'студию массажа' : 'салон красоты',
      nicheGen: hay.includes('груминг') ? 'груминг-салона' : hay.includes('массаж') ? 'студии массажа' : 'салона красоты',
      clientsLabel: 'клиентов',
      bookingTitle: 'Онлайн-запись к специалисту',
      bookingBtnText: 'Записаться онлайн',
      itemFieldLabel: '4. Пожелания к визиту / мастеру',
      itemFieldPlaceholder: 'Например: Удобное время, пожелания к процедуре',
      itemSummaryLabel: 'Детали визита',
      resourceHoursLabel: 'Часы работы мастеров',
      crmInWorkLabel: 'У мастеров сейчас',
      crmAddBtnLabel: 'Добавить запись в журнал',
      lineLabels: [
        'Линия 1 · Администратор / Запись',
        'Линия 2 · Старший специалист',
        'Линия 3 · Консультация по услугам',
      ],
      statusLabels: {
        new: 'Новая запись',
        confirmed: 'Подтверждена',
        in_repair: 'На процедуре',
        ready: 'Завершается',
        done: 'Визит выполнен',
      },
      defaultServices: BEAUTY_SERVICES,
    }
  }

  if (hay.includes('стоматолог') || hay.includes('мед') || hay.includes('клиник') || hay.includes('вет') || hay.includes('оптик')) {
    const isVet = hay.includes('вет')
    const isDent = hay.includes('стоматолог')
    return {
      group: 'medical',
      nicheNom: isVet ? 'Ветклиника' : isDent ? 'Стоматология' : 'Медицинский центр',
      nicheAcc: isVet ? 'ветклинику' : isDent ? 'стоматологию' : 'медицинский центр',
      nicheGen: isVet ? 'ветклиники' : isDent ? 'стоматологии' : 'медицинского центра',
      clientsLabel: isVet ? 'владельцев питомцев' : 'пациентов',
      bookingTitle: 'Онлайн-запись на приём',
      bookingBtnText: 'Записаться на приём',
      itemFieldLabel: isVet ? '4. Питомец и причина обращения' : '4. Что беспокоит / Комментарий к приёму',
      itemFieldPlaceholder: isVet ? 'Например: Кот, плановый осмотр и вакцинация' : 'Например: Первичный осмотр, консультация врача',
      itemSummaryLabel: isVet ? 'Питомец / Причина' : 'Комментарий пациента',
      resourceHoursLabel: 'Часы приёма врачей',
      crmInWorkLabel: 'В кабинетах сейчас',
      crmAddBtnLabel: 'Записать на приём',
      lineLabels: [
        'Линия 1 · Регистратура / Запись',
        'Линия 2 · Дежурный врач',
        'Линия 3 · Консультация по снимкам и ценам',
      ],
      statusLabels: {
        new: 'Новая запись',
        confirmed: 'Подтверждена',
        in_repair: 'На приёме у врача',
        ready: 'Оформление рекомендаций',
        done: 'Приём завершён',
      },
      defaultServices: MEDICAL_SERVICES,
    }
  }

  if (
    hay.includes('кафе') ||
    hay.includes('ресторан') ||
    hay.includes('кофейн') ||
    hay.includes('кондитер') ||
    hay.includes('торт') ||
    hay.includes('цвет') ||
    hay.includes('суши') ||
    hay.includes('пицц') ||
    hay.includes('пекарн')
  ) {
    const isOrder = hay.includes('торт') || hay.includes('цвет') || hay.includes('кондитер')
    return {
      group: 'food',
      nicheNom: isOrder ? 'Мастерская заказов' : 'Заведение',
      nicheAcc: hay.includes('кофейн') ? 'кофейню' : hay.includes('ресторан') ? 'ресторан' : isOrder ? 'студию заказов' : 'кафе',
      nicheGen: hay.includes('кофейн') ? 'кофейни' : hay.includes('ресторана') ? 'ресторана' : isOrder ? 'студии' : 'кафе',
      clientsLabel: 'гостей',
      bookingTitle: isOrder ? 'Онлайн-предзаказ ко времени' : 'Бронь столика и предзаказ',
      bookingBtnText: isOrder ? 'Оформить предзаказ' : 'Забронировать столик',
      itemFieldLabel: isOrder ? '4. Пожелания к заказу / открытке / доставке' : '4. Количество гостей и пожелания к столику',
      itemFieldPlaceholder: isOrder ? 'Например: К 18:00, праздничная упаковка, подпись на открытке' : 'Например: 4 гостя, столик у окна, предзаказ горячего',
      itemSummaryLabel: isOrder ? 'Детали заказа' : 'Гости и столик',
      resourceHoursLabel: 'Часы приёма заказов',
      crmInWorkLabel: 'Готовится / Активные брони',
      crmAddBtnLabel: 'Добавить бронь / заказ',
      lineLabels: [
        'Линия 1 · Администратор зала / Бронь',
        'Линия 2 · Предзаказ и доставка',
        'Линия 3 · Банкеты и спецзаказы',
      ],
      statusLabels: {
        new: 'Новая бронь / заказ',
        confirmed: 'Подтверждено',
        in_repair: 'Готовится / Гости в зале',
        ready: 'Готово к выдаче',
        done: 'Выполнено',
      },
      defaultServices: FOOD_SERVICES,
    }
  }

  if (hay.includes('клининг') || hay.includes('химчист') || hay.includes('прачечн')) {
    return {
      group: 'home',
      nicheNom: 'Служба чистоты',
      nicheAcc: hay.includes('химчист') ? 'химчистку' : 'клининговую компанию',
      nicheGen: hay.includes('химчист') ? 'химчистки' : 'клининговой компании',
      clientsLabel: 'заказчиков',
      bookingTitle: 'Онлайн-заявка на уборку и чистку',
      bookingBtnText: 'Рассчитать и заказать',
      itemFieldLabel: '4. Адрес и площадь / описание вещей',
      itemFieldPlaceholder: 'Например: мкр 17, 2-комн. квартира 60 м² (или угловой диван)',
      itemSummaryLabel: 'Объект / Адрес',
      resourceHoursLabel: 'Часы выезда бригад',
      crmInWorkLabel: 'На выезде сейчас',
      crmAddBtnLabel: 'Добавить выезд в график',
      lineLabels: [
        'Линия 1 · Диспетчер / Расчёт стоимости',
        'Линия 2 · Бригадир выездной службы',
        'Линия 3 · Приём заказов по WhatsApp',
      ],
      statusLabels: {
        new: 'Новая заявка',
        confirmed: 'Выезд подтверждён',
        in_repair: 'Бригада в работе',
        ready: 'Готово к приёмке',
        done: 'Заказ сдан',
      },
      defaultServices: CLEANING_SERVICES,
    }
  }

  if (
    hay.includes('потолк') ||
    hay.includes('ремонт') ||
    hay.includes('окн') ||
    hay.includes('мебел') ||
    hay.includes('ателье')
  ) {
    return {
      group: 'home',
      nicheNom: 'Сервисная компания',
      nicheAcc: hay.includes('потолк')
        ? 'компанию по натяжным потолкам'
        : hay.includes('мебел')
        ? 'мебельную студию'
        : hay.includes('окн')
        ? 'оконную компанию'
        : hay.includes('ателье')
        ? 'ателье'
        : 'сервисную компанию',
      nicheGen: 'компании',
      clientsLabel: 'заказчиков',
      bookingTitle: 'Запись на замер и расчёт стоимости',
      bookingBtnText: 'Записаться на замер / расчёт',
      itemFieldLabel: '4. Адрес или описание вашей задачи',
      itemFieldPlaceholder: 'Например: ЖК Актау, замер 3 комнат + расчёт по материалам',
      itemSummaryLabel: 'Задача / Адрес',
      resourceHoursLabel: 'Часы выезда мастеров',
      crmInWorkLabel: 'В работе / На замере',
      crmAddBtnLabel: 'Добавить заявку в график',
      lineLabels: [
        'Линия 1 · Отдел приёма заявок и расчёта',
        'Линия 2 · Инженер-замерщик',
        'Линия 3 · Отдел монтажа и сервиса',
      ],
      statusLabels: {
        new: 'Новая заявка',
        confirmed: 'Замер согласован',
        in_repair: 'В производстве / В работе',
        ready: 'Готово к сдаче',
        done: 'Заказ выполнен',
      },
      defaultServices: HOME_SERVICES,
    }
  }

  if (
    hay.includes('фитнес') ||
    hay.includes('детск') ||
    hay.includes('репетитор') ||
    hay.includes('курс') ||
    hay.includes('фото') ||
    hay.includes('автошкол')
  ) {
    return {
      group: 'education',
      nicheNom: hay.includes('фото') ? 'Фотостудия' : hay.includes('фитнес') ? 'Фитнес-клуб' : 'Центр развития',
      nicheAcc: hay.includes('фото') ? 'фотостудию' : hay.includes('фитнес') ? 'фитнес-клуб' : 'центр',
      nicheGen: hay.includes('фото') ? 'фотостудии' : hay.includes('фитнес') ? 'фитнес-клуба' : 'центра',
      clientsLabel: 'посетителей',
      bookingTitle: hay.includes('фото') ? 'Бронь зала и фотосессии' : 'Запись на пробное занятие',
      bookingBtnText: hay.includes('фото') ? 'Забронировать время' : 'Записаться на занятие',
      itemFieldLabel: '4. Направление / Возраст / Пожелания',
      itemFieldPlaceholder: 'Например: Пробное занятие, удобное время после 16:00',
      itemSummaryLabel: 'Детали записи',
      resourceHoursLabel: 'Часы работы залов',
      crmInWorkLabel: 'На занятии / В зале',
      crmAddBtnLabel: 'Добавить запись в расписание',
      lineLabels: [
        'Линия 1 · Администратор ресепшн',
        'Линия 2 · Запись в группы и залы',
        'Линия 3 · Консультация по абонементам',
      ],
      statusLabels: {
        new: 'Новая запись',
        confirmed: 'Подтверждена',
        in_repair: 'Идёт занятие / съёмка',
        ready: 'Завершается',
        done: 'Посещение закрыто',
      },
      defaultServices: EDUCATION_SERVICES,
    }
  }

  if (hay.includes('мойк') || hay.includes('avtomoyka')) {
    return {
      group: 'auto',
      nicheNom: 'Автомойка и детейлинг',
      nicheAcc: 'автомойку',
      nicheGen: 'автомойки',
      clientsLabel: 'автовладельцев',
      bookingTitle: 'Запись на мойку без очереди',
      bookingBtnText: 'Записаться без очереди',
      itemFieldLabel: '4. Марка авто и госномер',
      itemFieldPlaceholder: 'Например: Toyota Camry 70 · 727 AAA 12',
      itemSummaryLabel: 'Автомобиль',
      resourceHoursLabel: 'Часы работы боксов',
      crmInWorkLabel: 'На мойке сейчас',
      crmAddBtnLabel: 'Добавить авто в бокс',
      lineLabels: [
        'Линия 1 · Администратор автомойки',
        'Линия 2 · Детейлинг и химчистка',
        'Линия 3 · Предварительная запись',
      ],
      statusLabels: {
        new: 'Новая запись',
        confirmed: 'Ожидаем в боксе',
        in_repair: 'В боксе (Мойка)',
        ready: 'Машина готова!',
        done: 'Выдано клиенту',
      },
      defaultServices: CARWASH_SERVICES,
    }
  }

  // Fallback: Автосервис (для существующих 25 СТО включая MarSagi)
  return {
    group: 'auto',
    nicheNom: 'Автосервис',
    nicheAcc: 'автосервис',
    nicheGen: 'автосервиса',
    clientsLabel: 'автовладельцев',
    bookingTitle: 'Запись в автосервис',
    bookingBtnText: 'Записаться онлайн',
    itemFieldLabel: '4. Данные автомобиля и контакт',
    itemFieldPlaceholder: 'Марка, модель и год (например: Toyota Camry 70, Zeekr 001)',
    itemSummaryLabel: 'Автомобиль',
    resourceHoursLabel: 'Часы приёма боксов',
    crmInWorkLabel: 'В боксах сейчас',
    crmAddBtnLabel: 'Добавить в расписание боксов',
    lineLabels: [
      'Линия 1 · Главный приёмщик / Запись',
      'Линия 2 · Мастер цеха / Консультация',
      'Линия 3 · Детейлинг и подбор запчастей',
    ],
    statusLabels: {
      new: 'Новая заявка',
      confirmed: 'Подтверждена',
      in_repair: 'В боксе (Ремонт)',
      ready: 'Готово к выдаче',
      done: 'Выдано клиенту',
    },
    defaultServices: cfg.services || [],
  }
}
