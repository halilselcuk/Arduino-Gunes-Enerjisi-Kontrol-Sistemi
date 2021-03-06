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
var butonlar;
var pinler = [];

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

//Butonlar yerel depolamada varsa onları kullan yoksa Arduino'dan getir
if(localStorage.getItem("butonlar") == null) butonlariGetir();
else
{
	try
	{
		butonlar = JSON.parse(localStorage.getItem("butonlar"));
	}
	catch(e)
	{
		butonlariGetir();
	}
}

//Butonları arayüze ekle
butonlariEkle();

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
	$("#depolanan-enerji-cizelgesi").parent().css("height", "500px").parent().parent().removeClass("col-md-6").addClass("col-md-12");
	$("#alinan-verilen-guc-cizelgesi").parent().css("height", "500px").parent().parent().removeClass("col-md-6").addClass("col-md-12");
}

//Çizelgeleri hazırla
var canvas = document.getElementById("alinan-verilen-guc-cizelgesi").getContext('2d');
var alinanVerilenGucCizelgesi = new Chart(canvas, {
    type: 'line',
    data: {
			datasets: [
			{
				label: "Alınan",
				backgroundColor: "rgb(253,184,19)",
				borderColor: "rgb(253,184,19)",
				fill: false
			},
			{
				label: "Verilen",
				backgroundColor: "rgb(139,0,0)",
				borderColor: "rgb(139,0,0)",
				fill: false
			}
		]},
		options: {
			responsive: true,
			title: {
				display: true,
				text: 'Alınan/Verilen Güç'
			},
			scales: {
				yAxes: [{
					display: true,
					scaleLabel: {
						display: true,
						labelString: 'W'
					},
					ticks: {
						suggestedMin: 0,
						suggestedMax: parseInt(ayarlar.sV * ayarlar.pEYA)
					}
				}]
			},
			elements: {point: {radius: 1}},
			maintainAspectRatio: false
		}
});
var canvas2 = document.getElementById("depolanan-enerji-cizelgesi").getContext('2d');
var depolananEnerjiCizelgesi = new Chart(canvas2, {
    type: 'line',
    data: {
			datasets: [
			{
				label: "Gerilim",
				backgroundColor: "rgba(0, 134, 255, 0.99)",
				fill: true
			}
		]},
		options: {
			responsive: true,
			title: {
				display: true,
				text: 'Akü Gerilimi'
			},
			scales: {
				yAxes: [{
					display: true,
					scaleLabel: {
						display: true,
						labelString: 'Volt'
					},
					ticks: {
						suggestedMin: ayarlar.dDV,
						suggestedMax: ayarlar.aSDV
					}
				}]
			},
			elements: {point: {radius: 1}},
			maintainAspectRatio: false,
			tooltips: {
			 callbacks: {
				label: function(tooltipItem, data) {					
                    var label = tooltipItem.yLabel + "v";
					label += ", ";
					label += wHBul(tooltipItem.yLabel) + "wh";
                    return label;
				}
			  }
			},			
			legend: {
				display: false
			}
		},
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
		var akuWH = wHBul(degerler.akuV);
		//Akü derin deşarj sınırının altına düştüyse Depolanan Enerji bölümünün arka planını kırmızı yap
		if(degerler.akuV < ayarlar.dDV) $("#depolanan-enerji i").css("background-color", "#B33A3A");
		else $("#depolanan-enerji i").css("background-color", "#0086ff");
		
		//Akü tahmini geriliminden yüzde hesabı. 0 = derin deşarj gerilimi, 100 = akünün şarj durdurma gerilimi  
		var yuzde = ((degerler.akuV - ayarlar.dDV) * 100) / (ayarlar.aSDV - ayarlar.dDV);
		//Değerleri arayüze yaz
		$("#depolanan-enerji .progress-bar").css("width", yuzde+"%").attr("aria-valuenow", yuzde);
		if(yuzde > 10) $("#depolanan-enerji .progress-bar").html("%"+yuzde.toFixed(0));
		else $("#depolanan-enerji .progress-bar").html("");
		$("#depolanan-enerji b").html(akuWH);
		
		//Panel rölesi kapalıysa
		if(degerler.panelR == 1)
		{
			//Arkaplan rengini kahveringi yap
			$("#alinan-guc i").css("background-color", "#8B4513");
			//Panel simgesinin rengini panel voltajıyla doğru orantılı olarak beyazlaştır
			//pSBV = panelSarjBaslangicVoltu
			var pHex = pickHex([255, 255, 255], [33, 37, 41], degerler.panelV / ayarlar.pSBV);
			var renk = "rgb("+pHex[0]+", "+pHex[1]+", "+pHex[2]+")";
			$("#alinan-guc i").css("color", renk);
		}
		//Panel rölesi açıksa
		else 
		{
			//Arkaplan rengini sarı yap
			$("#alinan-guc i").css("background-color", "#ffc107");
			//Panel simgesini beyaz yap
			$("#alinan-guc i").css("color", "#fff");
		}
		
		//Çekilebilecek en yüksek akımın ne kadarının çekildiğinin hesabı
		//%100 = panelden çekilebilecek en yüksek akım
		var yuzde = (degerler.panelA * 100) / ayarlar.pEYA;
		//Alınan güç hesabı. ayarlar.sV = şarj voltu
		var alinanW = parseInt((ayarlar.sV * degerler.panelA).toFixed(0));
		//Değerleri arayüze yaz
		$("#alinan-guc .progress-bar").css("width", yuzde+"%").attr("aria-valuenow", yuzde);
		if(yuzde > 10) $("#alinan-guc .progress-bar").html("%"+yuzde.toFixed(0));
		else $("#alinan-guc .progress-bar").html("");
		$("#alinan-guc b").html(alinanW);
			
		//Aşırı akım sınırına ne kadar yaklaşıldığının hesabı
		//%100 = aküden çekilebilecek akım
		var yuzde = (degerler.akuA * 100) / ayarlar.aAS;
		//Verilen güç hesabı
		var verilenW = parseInt((degerler.akuV * degerler.akuA).toFixed(0));
		//Değerleri arayüze yaz
		$("#verilen-guc .progress-bar").css("width", yuzde+"%").attr("aria-valuenow", yuzde);
		if(yuzde > 10) $("#verilen-guc .progress-bar").html("%"+yuzde.toFixed(0));
		else $("#verilen-guc .progress-bar").html("");
		$("#verilen-guc b").html(verilenW);
		
		//Kalan süre hesabı
		var kalanSure = akuWH;
		var alinanVerilen = verilenW - alinanW;
		if(alinanVerilen > 0) kalanSure = akuWH / alinanVerilen;
		else if(alinanVerilen < 0) kalanSure = (akuWH + Math.abs(alinanW)) / verilenW;
		//Değeri arayüze yaz
		$("#verilen-guc strong").html(kalanSure.toFixed(1));
		
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
		
		if(degerler.pompaDurumu == 0) $("#pompa-btn").addClass("btn-secondary");
		else if(degerler.pompaDurumu == 1) $("#pompa-btn").addClass("btn-danger");
		else if(degerler.pompaDurumu == 2) $("#pompa-btn").addClass("btn-primary");
		else if(degerler.pompaDurumu == 3) $("#pompa-btn").addClass("btn-info");
		else if(degerler.pompaDurumu == 4) $("#pompa-btn").addClass("btn-warning");
		
		//Buton simgelerini rölelerin durumlarına göre renklendir
		if(degerler.bahceR == 1) $("#bahce-btn").children("em").css("color", "#fff");
		else $("#bahce-btn").children("em").css("color", "#ffc107");
		
		if(degerler.lavaboR == 1) $("#lavabo-btn").children("em").css("color", "#fff");
		else $("#lavabo-btn").children("em").css("color", "#ffc107");
		
		if(degerler.fanR == 1) $("#sogutma-btn").children("em").css("color", "#fff");
		else $("#sogutma-btn").children("em").css("color", "#ffc107");
		
		if(degerler.pompaR == 1) $("#pompa-btn").children("em").css("color", "#fff");
		else $("#pompa-btn").children("em").css("color", "#ffc107");
		
		//Butonları pinlerin durumuna göre renklendir
		for (key in pinler) 
		{
			var pin = pinler[key];
			if(degerler["p"+pin] == 1) $("#"+pin+"-btn").addClass("btn-secondary");
			else $("#"+pin+"-btn").addClass("btn-danger");
		}
		
		//Fonksiyonun ilk çalışmasıysa
		if(dakika == null) 
		{
			//Değerleri çizelgelere ekle
			
			depolananEnerjiCizelgesi.data.labels.push(saatDakika());
			depolananEnerjiCizelgesi.data.datasets[0].data.push(degerler.akuV.toFixed(2));
			depolananEnerjiCizelgesi.update();
			
			alinanVerilenGucCizelgesi.data.labels.push(saatDakika());
			alinanVerilenGucCizelgesi.data.datasets[0].data.push(alinanW);
			alinanVerilenGucCizelgesi.data.datasets[1].data.push(verilenW);
			alinanVerilenGucCizelgesi.update();
			
			//Eklendiği dakikayı tut
			dakika = d.getMinutes();
		}
		else 
		{
			//Değerleri ortalamasının sonraki dakika alınması için topla
			depolananEnerjiToplam += degerler.akuV;
			alinanGucToplam += alinanW;
			verilenGucToplam += verilenW;
			//Ortalama almak için toplamların bölüneceği sayıyı arttır
			veriSayisi++;
		}
		
		//Dakika değiştiyse
		if(dakika != d.getMinutes())
		{
			//Eklenen veri sayısı fazlaysa en baştaki veriyi sil
			if(depolananEnerjiCizelgesi.data.labels.length > 180)
			removeData(depolananEnerjiCizelgesi);
			
			//Toplanan verilerin ortalamasını alıp çizelgenin sonuna ekle
			
			depolananEnerjiCizelgesi.data.labels.push(saatDakika());
			depolananEnerjiCizelgesi.data.datasets[0].data.push((depolananEnerjiToplam/veriSayisi).toFixed(2));
			depolananEnerjiCizelgesi.update();
			
			depolananEnerjiToplam = 0;
			
			
			//Eklenen veri sayısı fazlaysa en baştaki veriyi sil
			if(alinanVerilenGucCizelgesi.data.labels.length > 180)
			removeData(alinanVerilenGucCizelgesi);
			
			//Toplanan verilerin ortalamasını alıp çizelgenin sonuna ekle
			
			alinanVerilenGucCizelgesi.data.labels.push(saatDakika());
			alinanVerilenGucCizelgesi.data.datasets[0].data.push(parseInt(alinanGucToplam/veriSayisi));
			alinanVerilenGucCizelgesi.data.datasets[1].data.push(parseInt(verilenGucToplam/veriSayisi));
			alinanVerilenGucCizelgesi.update();
			
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

$("#pompa-btn").on({
mousedown: function() {
	basiliTutma = false;
	//Buton 3 sn sonra bırakılmazsa kalıcı ayar yap
	$(this).data('timer', setTimeout(function(th) {
		basiliTutma = true;
		//Otomatik ise kalıcı kapat
		if(degerler.pompaDurumu == 2) komut("pompa", 0);
		//Kalıcı kapalıysa kalıcı aç
		else if(degerler.pompaDurumu == 0) komut("pompa", 1);
		//Kalıcı açık ya da geçiciyse otomatik yap
		else komut("pompa", 2);
		
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
		if(degerler.pompaR == 0) komut("pompa", 4);
		//Röle kapalıysa geçici aç
		else if(degerler.pompaR == 1) komut("pompa", 3);
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

$("#reset-btn").on({
click: function() {
	komut("reset", 5);
	toastr.info('Reset komutu gönderildi.');
}
});

function buton(pin)
{
	//Pin durumunun tersini yap
	if(degerler["p"+pin] == 1) digitalWrite(pin, 0);
	else digitalWrite(pin, 1);
}

function digitalWrite(pin, durum)
{
	$.ajax({
		type: 'POST',
		url: "digital_write",
		data: "key="+getCookie("key")+"&pin="+pin+"&durum="+durum,
		success: function(r){
			if(r != "1") 
			{
				toastr.error('Komut gönderilemedi.');
				return;
			}
			/*if(durum == 0) toastr.info('Açma komutu gönderildi.');
			if(durum == 1) toastr.info('Kapatma komutu gönderildi.');*/
			//Komut gönderildikten sonra arayüzdeki verileri güncelle
			degerleriYenile(false);
		},
		error: function(){
		toastr.error('Komut gönderilemedi.');
		}
	});
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
			/*if(durum == 0) toastr.info('Kapatma komutu gönderildi.');
			if(durum == 1) toastr.info('Açma komutu gönderildi.');
			if(durum == 2) toastr.info('Otomatik ayar komutu gönderildi.');
			if(durum == 3) toastr.info('Geçici açma komutu gönderildi.');
			if(durum == 4) toastr.info('Geçici kapatma komutu gönderildi.');*/
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

function wHBul(akuV)
{
	var geciciDegerler = [0];

	//Akünün gerilimi hangi değere yakın bul
	for (dg in wHDizisi) 
	{
		 dg = parseFloat(dg);
		 var fark = Math.abs(akuV - dg);
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
		$("#depolanan-enerji-cizelgesi").parent().css("height", "300px").parent().parent().removeClass("col-md-12").addClass("col-md-6");
		$("#alinan-verilen-guc-cizelgesi").parent().css("height", "300px").parent().parent().removeClass("col-md-12").addClass("col-md-6");
		
		localStorage.setItem("cizelge-boyutu", "0");
	}
	else
	{
		$("#depolanan-enerji-cizelgesi").parent().css("height", "500px").parent().parent().removeClass("col-md-6").addClass("col-md-12");
		$("#alinan-verilen-guc-cizelgesi").parent().css("height", "500px").parent().parent().removeClass("col-md-6").addClass("col-md-12");
		localStorage.setItem("cizelge-boyutu", "1");
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
		else toastr.success('Gönderilen/kaydedilen: ' + metin.length +"/"+ r, $("#dosya-adi").val() + ' Yüklendi', {extendedTimeOut: 0, timeOut: 0, closeButton: true});
	  },
	  error: function(){
		toastr.error('Yükleme başarısız.');
	  },
	  timeout: 300000,
	  async: false
	});
}

function butonlariGetir()
{
	//Arduino'dan butonları getirir.
	$.ajax({
		type: 'GET',
		url: "butonlar.txt",
		success: function(r){
			try
			{
				butonlar = JSON.parse(r);
			}
			catch(e)
			{
				toastr.error('Butonların dizisi ayrıştırılamadı.');
				return;
			}
			localStorage.setItem("butonlar", r);
		},
		error: function(){
			toastr.error('Butonların dizisi getirilemedi.');
		},
		async: false
	});
}

function butonlariEkle()
{
	$("#islemler").html("");
	for(key in butonlar) 
	{
		var btn = butonlar[key];
		//Onclick
		var oC = '';
		//Eğer btn.id tam sayıysa bu bir pin tetikleyen butondur
		if(Number.isInteger(btn.id)) 
		{
			pinler.push(btn.id);
			oC = 'onclick="buton('+btn.id+')";';
		}
		var html = `
					<div class="col-lg-3 col-md-4 col-sm-6">
						<button id="`+btn.id+`-btn" `+oC+` type="button" class="btn btn-circle btn-lg islem">
							<em class="`+btn.simge+`"></em>
						</button>
						<p>`+btn.ad+`</p>
					</div>`;
		$("#islemler").append(html);
	}
}

function butonlariDuzenle()
{
	//Sayfanın kapatılmasını önle
	window.onbeforeunload = function() {return "Sayfayı kapatmak istediğinizden emin misiniz?";};
	$("#islemler").html("");
	for (key in butonlar) 
	{
		var btn = butonlar[key];
		var html = `
					<div class="col-lg-3 col-md-4 col-sm-6 border duzenlenen-buton" style="margin-bottom: 15px;">
						<div class="form-group">
						  <label>Ad:</label>
						  <input type="text" class="form-control" id="btn-ad" value="`+btn.ad+`">
						</div>
						<div class="form-group">
						  <label>ID ya da pin:</label>
						  <input type="text" class="form-control" id="btn-id" value="`+btn.id+`">
						</div>
						<div class="form-group">
						  <label>Simge:</label>
						  <input type="text" class="form-control" id="btn-simge" value="`+btn.simge+`">
						</div>
					</div>`;
		$("#islemler").append(html);
	}

	$("#islemler").append(`
					<div class="col-lg-3 col-md-4 col-sm-6 border duzenlenen-buton" style="margin-bottom: 15px;">
						<div class="form-group">
						  <label>Ad:</label>
						  <input type="text" class="form-control" id="btn-ad" placeholder="Yeni butonun adı">
						</div>
						<div class="form-group">
						  <label>ID ya da pin:</label>
						  <input type="text" class="form-control" id="btn-id" placeholder="Yeni Buton ID'si ya da pin'i">
						</div>
						<div class="form-group">
						  <label>Simge:</label>
						  <input type="text" class="form-control" id="btn-simge" placeholder="Yeni butonun simgesi">
						</div>
					</div>
					<button type="button" class="btn btn-warning col-sm-12" onclick="butonlariKaydet()"><i class="fas fa-save"></i></button>
					`);
}

function butonlariKaydet()
{
	butonlar = [];
	pinler = [];
	
	$(".duzenlenen-buton").each(function(index, element) {
		var btn = {};		
		btn.ad = $(element).find("#btn-ad").val();
		btn.id = $(element).find("#btn-id").val();
		btn.simge = $(element).find("#btn-simge").val();
		if(btn.id == "") return true;
		
		if(!isNaN(btn.id))
		{
			btn.id = parseInt(btn.id);
			pinler.push(btn.id);
		}
		
		butonlar.push(btn);
		
	});
	
	$("#dosya-adi").val("pinler.txt");
	$("#metin").val(pinler.join()+",");
	dosyaYukle();
	
	$("#dosya-adi").val("butonlar.txt");
	$("#metin").val(JSON.stringify(butonlar));
	dosyaYukle();
	localStorage.setItem("butonlar", JSON.stringify(butonlar));
	
	komut("pinleri_yeniden_tanimla", 5);
	toastr.info('Diğer cihazlarda yerel depolamayı temizleyin.', 'Butonlar güncellendi.', {extendedTimeOut: 0, timeOut: 0, closeButton: true});
	
	butonlariEkle();
	//Uyarıyı kaldır
	window.onbeforeunload = "";
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

//Chart.js
function removeData(chart) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((dataset) => {
        dataset.data.shift();
    });
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