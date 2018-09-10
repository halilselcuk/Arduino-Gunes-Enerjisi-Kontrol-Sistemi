var degerler;
var wHKalibrasyonDurumu = false;
var wHKalibrasyonAmperi;
var wHKalibrasyonDegerleri;
var basiliTutma = false;
var depolananEnerjiToplam = 0;
var alinanGucToplam = 0;
var verilenGucToplam = 0;
var dakika = null;
var veriSayisi = 0;
var wHDizisi;
var ayarlar;

//Ayarları getir
$.ajax({
  type: 'GET',
  url: "cfg.txt",
  success: function(r){
	ayarlar = JSON.parse(r);
  },
  error: function(){
	toastr.error('Ayarlar getirilemedi.');
  },
  async: false
});

//WH bilgileri yerel depolamada varsa onları kullan yoksa Arduino'dan getir
if(localStorage.getItem("wh-dizisi") == null) wHGetir();
else
{
	try
	{
		wHDizisi = JSON.parse(localStorage.getItem("wh-dizisi"));
	}
	catch(e)
	{
		wHGetir();
	}
}

//Kullanıcı yöneticiyse yönetici araçlarını göster
if(getCookie("yonetici") == "1") $(".yonetici-araci").css("display", "");

//Açılışta anasayfayı aç
anasayfa();

degerleriYenile();

$.ajaxSetup({
	timeout: 15000,
	//async: false
});

//Yerel depolamadaki bilgiye göre çizelgelerin boyutlarını belirle
if(localStorage.getItem("cizelge-boyutu") == "1")
{
	$("#depolanan-enerji-cizelgesi").parent().parent().parent().removeClass("col-md-6").addClass("col-md-12");
	$("#alinan-verilen-guc-cizelgesi").parent().parent().parent().removeClass("col-md-6").addClass("col-md-12");
}

//Çizelgeleri hazırla
var canvas = $("#alinan-verilen-guc-cizelgesi").get(0).getContext("2d");
var alinanVerilenGucCizelgesi = new Chart(canvas).Line({
labels : [],
datasets: [
	{
		label: "Alinan",
		fillColor: "rgba(253,184,19,0.4)",
		strokeColor: "rgba(253,184,19,1)",
		pointColor: "rgba(253,184,19,1)",
		pointStrokeColor: "#fff",
		pointHighlightFill: "#fff",
		pointHighlightStroke: "rgba(220,220,220,1)"
	},
	{
		label: "Verilen",
		fillColor: "rgba(139,0,0,0.7)",
		strokeColor: "rgba(139,0,0,1)",
		pointColor: "rgba(139,0,0,1)",
		pointStrokeColor: "#fff",
		pointHighlightFill: "#fff",
		pointHighlightStroke: "rgba(220,220,220,1)"
	}
]
});
var canvas2 = $("#depolanan-enerji-cizelgesi").get(0).getContext("2d");
var depolananEnerjiCizelgesi = new Chart(canvas2).Line(
{
labels : [],
datasets: [
{
	label: "Enerji",
	fillColor: "rgba(0, 134, 255,0.6)",
	strokeColor: "rgba(0, 134, 255,1)",
	pointColor: "rgba(0, 134, 255,1)",
	pointStrokeColor: "#fff",
	pointHighlightFill: "#fff",
	pointHighlightStroke: "rgba(220,220,220,1)"
}
]
});

function degerleriYenile(yineleme = true)
{
	$.ajax({
	  type: 'GET',
	  url: "degerler",
	  success: function(r){
		//İzinsizse giriş sayfasına yönlendir
		if(r=="401") icerigiDegistir("giris.htm");
		
		//Değerleri ayrıştır
		degerler = JSON.parse(r);
		
		//Değerleri kalibrasyon sayfasına yaz
		$("#akuV").val(degerler.akuV);
		$("#panelV").val(degerler.panelV);
		$("#akuA").val(degerler.akuA);
		$("#panelA").val(degerler.panelA);
		
		//WH kalibrasyonu yapılıyorsa kalibrasyon verilerini yenile
		if(wHKalibrasyonDurumu) wHKalibrasyonu();
		
		var d = new Date();
		
		//Kaç WH enerji depolandığı bilgisini getir
		var akuWH = wHBul();
		//Akü derin deşarj sınırının altına düştüyse Depolanan Enerji bölümünün arka planını kırmızı yap
		if(degerler.akuV < ayarlar.dDV) $("#depolanan-enerji i").css("background-color", "#B33A3A");
		else $("#depolanan-enerji i").css("background-color", "#0086ff");
		
		//Akü tahmini geriliminden yüzde hesabı. 0 = derin deşarj gerilimi, 100 = akünün şarj durdurma gerilimi  
		var yuzde = ((degerler.akuV - ayarlar.dDV) * 100) / (ayarlar.aSDV - ayarlar.dDV);
		//Değerleri arayüze yaz
		$("#depolanan-enerji .progress-bar").css("width", yuzde+"%").attr("aria-valuenow", yuzde);
		$("#depolanan-enerji b").html(akuWH);
		
		//Alınan güç hesabı. 14.5 = regülatörün gerilimi
		var alinanW = parseInt((14.5 * degerler.panelA).toFixed(0));
		//Güç girişi yoksa
		if(degerler.panelR == 1)
		{
			//Arkaplan rengini kahveringi yap
			$("#alinan-guc i").css("background-color", "#8B4513");
			//Panel simgesinin rengini panel voltajıyla doğru orantılı olarak beyazlaştır
			//22 = panelin en fazla verdiği gerilim
			var pHex = pickHex([255, 255, 255], [33, 37, 41], degerler.panelV / 22);
			var renk = "rgb("+pHex[0]+", "+pHex[1]+", "+pHex[2]+")";
			$("#alinan-guc i").css("color", renk);
			//İlerleme barını %0 yap.
			$("#alinan-guc .progress-bar").css("width", 0).attr("aria-valuenow", 0);
			//Alınan güç değerini 0 yap
			$("#alinan-guc b").html(0);
		}
		//Güç girişi varsa
		else 
		{
			//Arkaplan rengini sarı yap
			$("#alinan-guc i").css("background-color", "#ffc107");
			//Panel simgesini beyaz yap
			$("#alinan-guc i").css("color", "#fff");
			//Çekilebilecek en yüksek akımın ne kadarının çekildiğinin hesabı
			//%100 = panelden çekilebilecek en yüksek akım
			var yuzde = (degerler.panelA * 100) / ayarlar.pEYA;
			//Değerleri arayüze yaz
			$("#alinan-guc .progress-bar").css("width", yuzde+"%").attr("aria-valuenow", yuzde);
			$("#alinan-guc b").html(alinanW);
		}
		
		//Güç çıkışı varsa arkaplan rengini kırmızı yoksa siyah yap
		if(degerler.fanR == 0 || degerler.bahceR == 0 || degerler.lavaboR == 0 || degerler.inverterR == 0 ||
		degerler.salonR == 0 || degerler.odaR == 0)
		$("#verilen-guc i").css("background-color", "#dc3545");
		else $("#verilen-guc i").css("background-color", "#212529");
		
		//Aşırı akım sınırına ne kadar yaklaşıldığının hesabı
		//%100 = aküden çekilebilecek akım
		var yuzde = (degerler.akuA * 100) / ayarlar.aAS;
		//Verilen güç hesabı
		var verilenW = parseInt((degerler.akuV * degerler.akuA).toFixed(0));
		//Değerleri arayüze yaz
		$("#verilen-guc .progress-bar").css("width", yuzde+"%").attr("aria-valuenow", yuzde);
		$("#verilen-guc b").html(verilenW);
		
		//İşlemlerdeki butonların renklerini kaldır
		$(".islem").removeClass("btn-primary");
		$(".islem").removeClass("btn-secondary");
		$(".islem").removeClass("btn-success");
		$(".islem").removeClass("btn-info");
		$(".islem").removeClass("btn-warning");
		$(".islem").removeClass("btn-danger");
			
		/* Butonları ayar durumuna göre renklendir
		0 kalıcı kapalı
		1 kalıcı açık
		2 otomatik
		3 geçici açık
		4 geçici kapalı*/
		if(degerler.bahceAydinlatmaDurumu == 0) $("#bahce-btn").addClass("btn-secondary");
		else if(degerler.bahceAydinlatmaDurumu == 1) $("#bahce-btn").addClass("btn-danger");
		else if(degerler.bahceAydinlatmaDurumu == 2) $("#bahce-btn").addClass("btn-primary");
		else if(degerler.bahceAydinlatmaDurumu == 3) $("#bahce-btn").addClass("btn-info");
		else if(degerler.bahceAydinlatmaDurumu == 4)	$("#bahce-btn").addClass("btn-warning");
		
		if(degerler.lavaboAydinlatmaDurumu == 0) $("#lavabo-btn").addClass("btn-secondary");
		else if(degerler.lavaboAydinlatmaDurumu == 1) $("#lavabo-btn").addClass("btn-danger");
		else if(degerler.lavaboAydinlatmaDurumu == 2) $("#lavabo-btn").addClass("btn-primary");
		else if(degerler.lavaboAydinlatmaDurumu == 3) $("#lavabo-btn").addClass("btn-info");
		else if(degerler.lavaboAydinlatmaDurumu == 4) $("#lavabo-btn").addClass("btn-warning");;
		
		if(degerler.fanDurumu == 0) $("#sogutma-btn").addClass("btn-secondary");
		else if(degerler.fanDurumu == 1) $("#sogutma-btn").addClass("btn-danger");
		else if(degerler.fanDurumu == 2) $("#sogutma-btn").addClass("btn-primary");
		else if(degerler.fanDurumu == 3) $("#sogutma-btn").addClass("btn-info");
		else if(degerler.fanDurumu == 4) $("#sogutma-btn").addClass("btn-warning");
		
		//Buton simgelerini rölelerin durumlarına göre renklendir
		if(degerler.bahceR == 1) $("#bahce-btn").children("em").css("color", "#fff");
		else $("#bahce-btn").children("em").css("color", "#ffc107");
		
		if(degerler.lavaboR == 1) $("#lavabo-btn").children("em").css("color", "#fff");
		else $("#lavabo-btn").children("em").css("color", "#ffc107");
		
		if(degerler.fanR == 1) $("#sogutma-btn").children("em").css("color", "#fff");
		else $("#sogutma-btn").children("em").css("color", "#ffc107");
		
		//Butonları rölelerin durumuna göre renklendir
		if(degerler.inverterR == 1) $("#inverter-btn").addClass("btn-secondary");
		else $("#inverter-btn").addClass("btn-danger");
		
		if(degerler.salonR == 1) $("#salon-btn").addClass("btn-secondary");
		else $("#salon-btn").addClass("btn-danger");
		
		if(degerler.odaR == 1) $("#oda-btn").addClass("btn-secondary");
		else $("#oda-btn").addClass("btn-danger");
		
		//Fonksiyonun ilk çalışmasıysa
		if(dakika == null) 
		{
			//Değerleri çizelgelere ekle
			depolananEnerjiCizelgesi.addData([akuWH], saatDakika());
			alinanVerilenGucCizelgesi.addData([Math.abs(alinanW), Math.abs(verilenW)], saatDakika());
			//Eklendiği dakikayı tut
			dakika = d.getMinutes();
		}
		else 
		{
			//Değerleri ortalamasının sonraki dakika alınması için topla
			depolananEnerjiToplam += akuWH;
			alinanGucToplam += alinanW;
			verilenGucToplam += verilenW;
			//Ortalama almak için toplamların bölüneceği sayıyı arttır
			veriSayisi++;
		}
		
		//Dakika değiştiyse
		if(dakika != d.getMinutes())
		{
			//Eklenen veri sayısı 15'i geçtiyse en baştaki veriyi sil
			if(depolananEnerjiCizelgesi.datasets[0].points.length > 15)
			depolananEnerjiCizelgesi.removeData();
			
			//Toplanan verilerin ortalamasını alıp çizelgenin sonuna ekle
			depolananEnerjiCizelgesi.addData([parseInt(depolananEnerjiToplam/veriSayisi)], saatDakika());
			depolananEnerjiToplam = 0;
			
			
			//Eklenen veri sayısı 15'i geçtiyse en baştaki veriyi sil
			if(alinanVerilenGucCizelgesi.datasets[0].points.length > 15)
			alinanVerilenGucCizelgesi.removeData();
			
			//Toplanan verilerin ortalamasını alıp çizelgenin sonuna ekle
			alinanVerilenGucCizelgesi.addData([Math.abs(alinanGucToplam/veriSayisi), Math.abs(verilenGucToplam/veriSayisi)], saatDakika());
			alinanGucToplam = 0;
			verilenGucToplam = 0;
			
			//Eklendiği dakikayı tut
			dakika = d.getMinutes();
			
			veriSayisi = 0;
		}
		
		//Yeni veriler işlendiğinde
		//Sağ üstteki "yayın" simgesini görünür yap
		$('#veri-gostergesi').css("opacity", "");

		if(yineleme)
		{
			//Döngüyü devam ettir
			setTimeout(degerleriYenile, 3000);
			//Sonraki çalışmaya kadar "yayın" simgesini saydamlaştır
			$('#veri-gostergesi').fadeOut(3000, "linear", function(){
			//Tasarımı bozduğu için kaldırmak yerine samdamlaştır
			$('#veri-gostergesi').css("display", "").css("opacity", "0");
			});
		}
	  },
	  error: function(){
		if(yineleme) setTimeout(degerleriYenile, 3000);
	  }
	});
}


$("#sogutma-btn").on({
mousedown: function() {
	basiliTutma = false;
	//Buton 3 sn sonra bırakılmazsa kalıcı ayar yap
	$(this).data('timer', setTimeout(function(th) {
		basiliTutma = true;
		//Otomatik ise kalıcı kapat
		if(degerler.fanDurumu == 2) komut("fan", 0);
		//Kalıcı kapalıysa kalıcı aç
		else if(degerler.fanDurumu == 0) komut("fan", 1);
		//Kalıcı açık ya da geçiciyse otomatik yap
		else komut("fan", 2);
		
	}, 3000, this));
},
mouseup: function() {
	//Buton bırakıldıysa kalıcı ayar zamanlamasını durdur
	clearTimeout( $(this).data('timer') );
},
mouseleave: function() {
	//Buton bırakıldıysa kalıcı ayar zamanlamasını durdur
	clearTimeout( $(this).data('timer') );
},
click: function() {
	//Buton basılı tutulmadıysa
	if(!basiliTutma)
	{
		//Röle açıksa geçici kapat
		if(degerler.fanR == 0) komut("fan", 4);
		//Röle kapalıysa geçici aç
		else if(degerler.fanR == 1) komut("fan", 3);
	}
}
});

$("#bahce-btn").on({
mousedown: function() {
	basiliTutma = false;
	//Buton 3 sn sonra bırakılmazsa kalıcı ayar yap
	$(this).data('timer', setTimeout(function(th) {
		basiliTutma = true;
		//Otomatik ise kalıcı kapat
		if(degerler.bahceAydinlatmaDurumu == 2) komut("bahce_aydinlatmasi", 0);
		//Kalıcı kapalıysa kalıcı aç
		else if(degerler.bahceAydinlatmaDurumu == 0) komut("bahce_aydinlatmasi", 1);
		//Kalıcı açık ya da geçiciyse otomatik yap
		else komut("bahce_aydinlatmasi", 2);
		
	}, 3000, this));
},
mouseup: function() {
	//Buton bırakıldıysa kalıcı ayar zamanlamasını durdur
	clearTimeout( $(this).data('timer') );
},
mouseleave: function() {
	//Buton bırakıldıysa kalıcı ayar zamanlamasını durdur
	clearTimeout( $(this).data('timer') );
},
click: function() {
	//Buton basılı tutulmadıysa
	if(!basiliTutma)
	{
		//Röle açıksa geçici kapat
		if(degerler.bahceR == 0) komut("bahce_aydinlatmasi", 4);
		//Röle kapalıysa geçici aç
		else if(degerler.bahceR == 1) komut("bahce_aydinlatmasi", 3);
	}
}
});

$("#lavabo-btn").on({
mousedown: function() {
	basiliTutma = false;
	//Buton 3 sn sonra bırakılmazsa kalıcı ayar yap
	$(this).data('timer', setTimeout(function(th) {
		basiliTutma = true;
		//Otomatik ise kalıcı kapat
		if(degerler.lavaboAydinlatmaDurumu == 2) komut("lavabo_aydinlatmasi", 0);
		//Kalıcı kapalıysa kalıcı aç
		else if(degerler.lavaboAydinlatmaDurumu == 0) komut("lavabo_aydinlatmasi", 1);
		//Kalıcı açık ya da geçiciyse otomatik yap
		else komut("lavabo_aydinlatmasi", 2);
		
	}, 3000, this));
},
mouseup: function() {
	//Buton bırakıldıysa kalıcı ayar zamanlamasını durdur
	clearTimeout( $(this).data('timer') );
},
mouseleave: function() {
	//Buton bırakıldıysa kalıcı ayar zamanlamasını durdur
	clearTimeout( $(this).data('timer') );
},
click: function() {
	//Buton basılı tutulmadıysa
	if(!basiliTutma)
	{
		//Röle açıksa geçici kapat
		if(degerler.lavaboR == 0) komut("lavabo_aydinlatmasi", 4);
		//Röle kapalıysa geçici aç
		else if(degerler.lavaboR == 1) komut("lavabo_aydinlatmasi", 3);
	}
}
});

function oda()
{
	//Röle durumunun tersini yap
	if(degerler.odaR == 1) komut("oda_aydinlatmasi", 1);
	else komut("oda_aydinlatmasi", 0);
}

function salon()
{
	//Röle durumunun tersini yap
	if(degerler.salonR == 1) komut("salon_aydinlatmasi", 1);
	else komut("salon_aydinlatmasi", 0);
}

function inverter()
{
	//Röle durumunun tersini yap
	if(degerler.inverterR == 1) komut("inverter", 1);
	else komut("inverter", 0);
}

function reset()
{
	komut("reset", 5);
	toastr.info('Reset komutu gönderildi.');
}

function komut(ad, durum)
{
	$.ajax({
		type: 'POST',
		url: ad,
		data: "key="+getCookie("key")+"&durum="+durum,
		success: function(r){
			if(r[0] != "1") 
			{
				toastr.error('Komut gönderilemedi.');
				return;
			}
			if(durum == 0) toastr.info('Kalıcı kapatma komutu gönderildi.');
			if(durum == 1) toastr.info('Kalıcı açma komutu gönderildi.');
			if(durum == 2) toastr.info('Otomatik ayar komutu gönderildi.');
			if(durum == 3) toastr.info('Açma komutu gönderildi.');
			if(durum == 4) toastr.info('Kapatma komutu gönderildi.');
			//Komut gönderildikten sonra arayüzdeki verileri güncelle
			degerleriYenile(false);
		},
		error: function(){
		toastr.error('Komut gönderilemedi.');
		}
	});
}

//Soldaki menüdeki butonların işlevleri
function anasayfa()
{
	//Bütün sayfaları içerikte görünmez yap
	$(".app-content").css("display", "none");
	//Sayfa butonlarının "active" etiketlerini kaldır
	$(".app-menu__item").removeClass("active");
	
	//Sayfayı görünür yap
	$("#anasayfa").css("display", "");
	//Butona "active" etiketi ekle
	$("#btn_anasayfa").addClass("active");
}
function ayarlarS()
{
	$(".app-content").css("display", "none");
	$(".app-menu__item").removeClass("active");
	
	$("#ayarlar").css("display", "");
	$("#btn_ayarlar").addClass("active");
	
	//Arduino'dan güncel ayarları getir
	$.ajax({
	  type: 'GET',
	  url: "cfg.txt",
	  success: function(r){
		//Ayarları ayrıştır
		ayarlar = JSON.parse(r);
		//Ayarları döngüye sok
		Object.keys(ayarlar).forEach(function(ayar) {
			//Ayarı arayüze yaz
			$("#cfg_"+ayar).parent().children("div").children("input").val(ayarlar[ayar]);

		});
	  },
	  error: function(){
		toastr.error('Ayarlar getirilemedi.');
	  }
	});
}
function kalibrasyon()
{
	$(".app-content").css("display", "none");
	$(".app-menu__item").removeClass("active");
	
	$("#kalibrasyon").css("display", "");
	$("#btn_kalibrasyon").addClass("active");
}
function kullanici()
{
	$(".app-content").css("display", "none");
	$(".app-menu__item").removeClass("active");
	
	$("#kullanici").css("display", "");
	$("#btn_kullanici").addClass("active");
}
function dosya()
{
	$(".app-content").css("display", "none");
	$(".app-menu__item").removeClass("active");
	
	$("#dosya").css("display", "");
	$("#btn_dosya").addClass("active");
}
function loglar()
{
	$(".app-content").css("display", "none");
	$(".app-menu__item").removeClass("active");
	
	$("#loglar").css("display", "");
	$("#btn_loglar").addClass("active");
	//Logları getir ve arayüze yaz
	$.ajax({
	  type: 'GET',
	  url: "loglar.txt",
	  success: function(r){
		$("#txt_loglar").val(r);
	  },
	  error: function(){
		toastr.error('Loglar getirilemedi.');
	  }
	});
}

function parolaDegistir()
{
	//Yeni parola doğrulaması doğruysa parola değiştirme komutu gönder
	if($("#yeni-parola").val() == $("#yeni-parola-dogrulama").val() && $("#yeni-parola").val() != "")
	$.ajax({
		type: 'POST',
		url: "parola_degistir",
		data: "key="+getCookie("key")+"&parola="+$("#yeni-parola").val()+"&eski_parola="+$("#parola").val(),
		success: function(r){
		if(r == "yanlis_parola") toastr.error('Eski parola yanlış girildi.');
		else if(r == "1") toastr.success("Parola değiştirildi.");
		else  toastr.error('Parola değiştirilemiyor.');
		},
		error: function(){
		toastr.error('Parola değiştirilemiyor.');
		}
	});
	else toastr.error('Yeni parolalar birbirinden farklı ya da boş.');
}
function kullaniciAdiDegistir()
{
	//Kullanıcı adı boş değilse kullanıcı adını değiştir
	if($("#kullanici-adi").val() != "")
	$.ajax({
		type: 'POST',
		url: "kullanici_adi_degistir",
		data: "key="+getCookie("key")+"&parola="+$("#parola").val()+"&kullanici="+$("#kullanici-adi").val(),
		success: function(r){
		if(r == "yanlis_parola") toastr.error('Eski parola yanlış girildi.');
		else if(r == "1") toastr.success("Kullanıcı adı değiştirildi.");
		else  toastr.error('Kullanıcı adı değiştirilemiyor.');
		},
		error: function(){
		toastr.error('Kullanıcı adı değiştirilemiyor.');
		}
	});
	else toastr.error('Kullanıcı adı boş.');
}
function yoneticiAdiDegistir()
{
	//Yöneticinin kullanıcı adı boş değilse yöneticinin kullanıcı adını değiştir
	if($("#yonetici-adi").val() != "")
	$.ajax({
		type: 'POST',
		url: "yonetici_adi_degistir",
		data: "key="+getCookie("key")+"&parola="+$("#parola").val()+"&kullanici="+$("#yonetici-adi").val(),
		success: function(r){
		if(r == "yanlis_parola") toastr.error('Eski parola yanlış girildi.');
		else if(r == "1") toastr.success("Kullanıcı adı değiştirildi.");
		else  toastr.error('Kullanıcı adı değiştirilemiyor.');
		},
		error: function(){
		toastr.error('Kullanıcı adı değiştirilemiyor.');
		}
	});
	else toastr.error('Kullanıcı adı boş.');
}

function ayarKaydetBtn(th)
{
	//Ayar adını ve değerini arayüzden bul
	var ad = $(th).parent().children("label").html();
	var deger = $(th).parent().children("div").children("input").val();
	
	//Kaydetme komutu gönder
	if(ad != "" && deger != "") ayarKaydet(ad, deger);
	else toastr.error('Değer boş olamaz.');
}
function ayarKaydet(ad, deger)
{
	$.ajax({
		type: 'POST',
		url: "ayar",
		data: "key="+getCookie("key")+"&ad="+ad+"&deger="+deger,
		success: function(r){
		if(r == "ayar_bulunamadi") toastr.error('Ayar bulunamadı.');
		else if(r == "1") toastr.success(ad + " ayarı kaydedildi.");
		else toastr.error('Ayar kaydedilemiyor.');
		},
		error: function(){
		toastr.error('Ayar kaydedilemiyor.');
		}
	});
}

function wHKalibrasyonuBaslat()
{
	//Girilen değeri dönüştür
	wHKalibrasyonAmperi = parseFloat($("#wh-kalibrasyon-amperi").val());
	
	$("#wh-kalibrasyon-amperi").val(wHKalibrasyonAmperi);
	//Arayüzü işlem bitene kadar devredışı bırak
	$("#wh-kalibrasyon-amperi").attr("disabled", "true");
	$("#wh-kalibrasyon-butonu").attr("disabled", "true");
	
	wHKalibrasyonDegerleri = [];
	//Volt, WH, zaman
	wHKalibrasyonDegerleri[0] = [0, 0, 0];
	//Değişkini true yaparak wHKalibrasyon fonksiyonunun değerler yenilendiğinde çağrılmasını sağla
	wHKalibrasyonDurumu = true;
	//İşlem bitine kadar sayfanın kapatılmasını önle
	window.onbeforeunload = function() {return "Devam eden işlemler var. Sayfayı kapatmak istediğinizden emin misiniz?";};
}

//wHKalibrasyonDurumu true ise her değer geldiğinde wHKalibrasyonu çağrılır
function wHKalibrasyonu()
{
	//timeStamp'i hesapla
	var timeStamp = Math.round(new Date().getTime()/1000);
	//Başlangıçsa
	if(wHKalibrasyonDegerleri[0][0] == 0)
	{
		//Başlangıç değerlerini tanımla
		wHKalibrasyonDegerleri[0] = [degerler.akuV, 0, timeStamp];
		return;
	}
	//Akünün gerilimi düştüyse
	if(degerler.akuV < wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length-1][0])
	{
		var sonWh = wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length-1][1];
		var sonZaman = wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length-1][2];
		//Geçen süreyle WH'u hesapla
		var suAnkiWh = (((degerler.akuV * wHKalibrasyonAmperi) / 60) / 60) * (timeStamp - sonZaman);
		//Önceki WH ile şu ana kadarki WH'u topla ve yeni değerleri diziye ekle
		wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length] = [degerler.akuV,
		(sonWh + suAnkiWh),
		timeStamp];
		//WH'u geliştirici konsoluna yaz
		console.log(wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length - 1]);
		//WH'u arayüze yaz
		$("#wh-kalibrasyon-toplam").val(wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length - 1][1]);
	}
	//10.8'in altına inildiyse kalibrasyonu bitir
	if(degerler.akuV < 10.8) wHKalibrasyonuBitir();
	
}
function wHKalibrasyonuBitir()
{
	//toplamWh'a 2 ekle. Buradaki 2, 10.8'in altındaki tahmini enerjidir.
	var toplamWh = wHKalibrasyonDegerleri[wHKalibrasyonDegerleri.length-1][1] + 2;
	var wHDegerleri = {};
	
	for(var i=0; i<=wHKalibrasyonDegerleri.length-1; i++)
	{
		//Akü geriliminin WH karşılığını küsaratı silerek tanımla
		wHDegerleri[wHKalibrasyonDegerleri[i][0].toFixed(2)] = (toplamWh-wHKalibrasyonDegerleri[i][1]).toFixed(0);
	}
	//Veriyi JSON'a dönüştürerek Arduino'ya yükle
	$("#dosya-adi").val("wh.txt");
	$("#metin").val(JSON.stringify(wHDegerleri));
	dosyaYukle();
	
	//Sayfa kapatılmak istendiğinde çıkan uyarıyı kaldır
	window.onbeforeunload = "";
	
	wHKalibrasyonDurumu = false;	
	//Arüyüzü etkinleştir
	$("#wh-kalibrasyon-amperi").removeAttr("disabled");
	$("#wh-kalibrasyon-butonu").removeAttr("disabled");
	
	toastr.success('wh.txt\'ye kaydetmek için gönderildi.', 'Kalibrasyon Tamamlandı', {extendedTimeOut: 0, timeOut: 0, closeButton : true});
	
	wHGetir();
}

function wHBul()
{
	var geciciDegerler = [0];

	//Akünün gerilimi hangi değere yakın bul
	for (dg in wHDizisi) 
	{
		 dg = parseFloat(dg);
		 var fark = Math.abs(degerler.akuV - dg);
		 if(fark < geciciDegerler[0] || geciciDegerler[0] == 0)
		{
			 geciciDegerler[0] = fark;
			 geciciDegerler[1] = dg;
		}
	}
	//Küsaratı kaldır ve WH'u döndür
	return parseInt(wHDizisi[geciciDegerler[1].toFixed(2)]);
}

function wHGetir()
{
	//Arduino'dan WH bilgilerini getirir.
	$.ajax({
		type: 'GET',
		url: "wh.txt",
		success: function(r){
			try
			{
				wHDizisi = JSON.parse(r);
			}
			catch(e)
			{
				toastr.error('WH dizisi ayrıştırılamadı.');
				return;
			}
			localStorage.setItem("wh-dizisi", r);
		},
		error: function(){
			toastr.error('WH dizisi getirilemedi.');
		},
		async: false
	});
}

function akuVC()
{
	$.ajax({
	  type: 'GET',
	  url: "kalibrasyon_degerleri",
	  success: function(r){
		var kalibrasyonDegerleri = JSON.parse(r);
		var deger = parseFloat($("#akuVC").val()) / parseInt(kalibrasyonDegerleri["akuGV"]);
		ayarKaydet("akuVoltCarpani", deger);
	  },
	  error: function(){
		toastr.error('Kalibrasyon değerleri getirilemedi.');
	  }
	});
}
function panelVC()
{
	$.ajax({
	  type: 'GET',
	  url: "kalibrasyon_degerleri",
	  success: function(r){
		var kalibrasyonDegerleri = JSON.parse(r);
		var deger = parseFloat($("#panelVC").val()) / parseInt(kalibrasyonDegerleri["panelGV"])
		ayarKaydet("panelVoltCarpani", deger);
	  },
	  error: function(){
		toastr.error('Kalibrasyon değerleri getirilemedi.');
	  }
	});
}
function akuAC()
{
	$.ajax({
	  type: 'GET',
	  url: "kalibrasyon_degerleri",
	  success: function(r){
		var kalibrasyonDegerleri = JSON.parse(r);
		//Kalibrasyon değerini sıfırından çıkar ve olması gereken değere böl
		var deger = parseFloat($("#akuAC").val()) / (parseInt(kalibrasyonDegerleri["akuGA"]) - parseInt(kalibrasyonDegerleri["akuAkimSensoruSifir"]));
		ayarKaydet("akuAmperCarpani", deger);
	  },
	  error: function(){
		toastr.error('Kalibrasyon değerleri getirilemedi.');
	  }
	});
}
function panelAC()
{
	$.ajax({
	  type: 'GET',
	  url: "kalibrasyon_degerleri",
	  success: function(r){
		var kalibrasyonDegerleri = JSON.parse(r);
		//Kalibrasyon değerini sıfırından çıkar ve olması gereken değere böl
		var deger = parseFloat($("#panelAC").val()) / (parseInt(kalibrasyonDegerleri["panelGA"]) - parseInt(kalibrasyonDegerleri["panelAkimSensoruSifir"]));
		ayarKaydet("panelAmperCarpani", deger);
	  },
	  error: function(){
		toastr.error('Kalibrasyon değerleri getirilemedi.');
	  }
	});
}
function akuSensorunuSifirla()
{
		$.ajax({
		type: 'POST',
		url: "aku_sensorunu_sifirla",
		data: "key="+getCookie("key"),
		success: function(r){
			toastr.info('Güç çıkışı durdurma ve sıfırlama komutu gönderildi. Yeni sıfır: ' + r);
		},
		error: function(){
		toastr.error('Sensör sıfırlama komutu gönderilemedi.');
		}
	});
}
function panelSensorunuSifirla()
{
		$.ajax({
		type: 'POST',
		url: "panel_sensorunu_sifirla",
		data: "key="+getCookie("key"),
		success: function(r){
			toastr.info('Güç girişi durdurma ve sıfırlama komutu gönderildi. Yeni sıfır: ' + r);
		},
		error: function(){
		toastr.error('Sensör sıfırlama komutu gönderilemedi.');
		}
	});
}
function cizelgeleriBoyutlandir()
{
	//Ayarı yerel depolamaya kaydeder ve sayfayı yeniler
	if(localStorage.getItem("cizelge-boyutu") == "1")
	{
		localStorage.setItem("cizelge-boyutu", "0");
		window.location.replace('/');
	}
	else
	{
		localStorage.setItem("cizelge-boyutu", "1");
		window.location.replace('/');
	}
}

function dosyaYukle()
{
	var metin = $("#metin").val();
	toastr.info('Yükleme başlatılıyor. Tamamlanması uzun sürebilir.');
	$.ajax({
	  type: 'POST',
	  url: "sd_write?overwrite=1&dosya=" + $("#dosya-adi").val() + "&key=" + getCookie("key"),
	  data: metin,
	  success: function(r){
		if(r.substring(0,6) == "dosya_") toastr.error('Dosya açılamadı. Dosya adını değiştirmeyi deneyin.');
		else toastr.success('Gönderilen/kaydedilen: ' + metin.length +"/"+ r, 'Yükleme tamamlandı.', {extendedTimeOut: 0, timeOut: 0, closeButton : true});
	  },
	  error: function(){
		toastr.error('Yükleme başarısız.');
	  },
	  timeout: 300000,
	  async: false
	});
}

function turkceKarakterleriDonustur()
{
	var metin = $("#metin").val();
	metin = metin.split(String.fromCharCode(231)).join("&#231;");
	metin = metin.split(String.fromCharCode(220)).join("&#220;");
	metin = metin.split(String.fromCharCode(350)).join("&#350;");
	metin = metin.split(String.fromCharCode(214)).join("&#214;");
	metin = metin.split(String.fromCharCode(208)).join("&#208;");
	metin = metin.split(String.fromCharCode(304)).join("&#304;");
	metin = metin.split(String.fromCharCode(199)).join("&#199;");
	metin = metin.split(String.fromCharCode(252)).join("&#252;");
	metin = metin.split(String.fromCharCode(351)).join("&#351;");
	metin = metin.split(String.fromCharCode(246)).join("&#246;");
	metin = metin.split(String.fromCharCode(287)).join("&#287;");
	metin = metin.split(String.fromCharCode(305)).join("&#305;");
	metin = metin.split(String.fromCharCode(0177)).join("&#0177;");
	$("#metin").val(metin);
}

function saatDakika()
{
	var d = new Date();
	var h = addZero(d.getHours());
	var m = d.getMinutes();
	if(m != 0) m-=1;
	else m = 59;
	m = addZero(m);
	return h + ":" + m;
}


function pickHex(color1, color2, weight) {
	//https://stackoverflow.com/questions/30143082/how-to-get-color-value-from-gradient-by-percentage-with-javascript
	var p = weight;
	var w = p * 2 - 1;
	var w1 = (w/1+1) / 2;
	var w2 = 1 - w1;
	var rgb = [Math.round(color1[0] * w1 + color2[0] * w2),
		Math.round(color1[1] * w1 + color2[1] * w2),
		Math.round(color1[2] * w1 + color2[2] * w2)];
	return rgb;
}

function addZero(i) {
	if (i < 10) {
		i = "0" + i;
	}
	return i;
}
function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length == 2) return parts.pop().split(";").shift();
}
	
//Vali Admin
(function () {
"use strict";

var treeviewMenu = $('.app-menu');

// Toggle Sidebar
$('[data-toggle="sidebar"]').click(function(event) {
	event.preventDefault();
	$('.app').toggleClass('sidenav-toggled');
});

// Activate sidebar treeview toggle
$("[data-toggle='treeview']").click(function(event) {
	event.preventDefault();
	if(!$(this).parent().hasClass('is-expanded')) {
		treeviewMenu.find("[data-toggle='treeview']").parent().removeClass('is-expanded');
	}
	$(this).parent().toggleClass('is-expanded');
});

// Set initial active toggle
$("[data-toggle='treeview.'].is-expanded").parent().toggleClass('is-expanded');

})();